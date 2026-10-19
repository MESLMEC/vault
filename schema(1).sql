-- =====================================================================================
-- MESL LAB FINANCE DATABASE  -  final-state schema (PostgreSQL 16)
-- Read it top to bottom: each PART builds on the ones above it.
--   PART 1  time:        tenures (the lab's handover periods)
--   PART 2  settings:    envelopes, events/projects, members, fee rules
--   PART 3  the ledger:  every taka that moves (append-only)
--   PART 4  decisions:   allocation sessions, event leftovers, sweeps
--   PART 5  dues:        what each member owes / has paid
--   PART 6  assets:      what the lab owns and who holds it
--   PART 7  handover:    closing a tenure (snapshots + carry-over)
--   PART 8  trust:       reconciliation (match the screen to your notes), health checks, the app's limited login
-- =====================================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------ shared helpers ---------------------------------------
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % refused: this table is append-only (use a reversal/correction)', TG_OP, TG_TABLE_NAME;
END $$;

CREATE FUNCTION sunday_on_or_before(d date) RETURNS date LANGUAGE sql IMMUTABLE AS
$$ SELECT d - extract(dow FROM d)::int $$;
CREATE FUNCTION sunday_on_or_after(d date) RETURNS date LANGUAGE sql IMMUTABLE AS
$$ SELECT d + ((7 - extract(dow FROM d)::int) % 7) $$;

-- =====================================================================================
-- PART 1: TENURES
-- =====================================================================================
CREATE TABLE tenures (
  id               bigserial PRIMARY KEY,
  name             text NOT NULL,
  opened_on        date NOT NULL,
  closed_on        date,                 -- NULL while the tenure is open
  closed_at        timestamptz,
  closing_checksum text,                 -- fingerprint of the money data at close (print it on the paper)
  CHECK (closed_on IS NULL OR closed_on >= opened_on),
  CHECK ((closed_on IS NULL) = (closed_at IS NULL)
     AND (closed_on IS NULL) = (closing_checksum IS NULL))
);
CREATE UNIQUE INDEX one_open_tenure ON tenures ((true)) WHERE closed_on IS NULL;

CREATE FUNCTION tenure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'tenures cannot be deleted'; END IF;
  IF OLD.closed_on IS NOT NULL OR NEW.closed_on IS NULL
     OR NEW.name <> OLD.name OR NEW.opened_on <> OLD.opened_on THEN
    RAISE EXCEPTION 'a tenure can only be changed by closing it (use close_tenure)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenure_guard BEFORE UPDATE OR DELETE ON tenures
  FOR EACH ROW EXECUTE FUNCTION tenure_guard();

CREATE FUNCTION open_tenure_start() RETURNS date LANGUAGE plpgsql STABLE AS $$
DECLARE d date;
BEGIN
  SELECT opened_on INTO d FROM tenures WHERE closed_on IS NULL;
  IF d IS NULL THEN RAISE EXCEPTION 'no open tenure'; END IF;
  RETURN d;
END $$;

-- =====================================================================================
-- PART 2: SETTINGS (small, editable tables; none of them hold money)
-- =====================================================================================
-- 2a. envelopes: the virtual wallets
CREATE TABLE envelopes (
  id             bigserial PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  target_cap     integer CHECK (target_cap >= 0),   -- NULL = no cap (used by allocation suggestions)
  alloc_priority integer,                           -- capped envelopes are filled in this order (1 first)
  is_pool        boolean NOT NULL DEFAULT false,    -- the Unallocated General Fund
  active         boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX one_pool ON envelopes ((true)) WHERE is_pool;

-- 2b. events / projects / competitions: a label you can attach to ledger entries
CREATE TABLE cost_centers (
  id     bigserial PRIMARY KEY,
  name   text NOT NULL,
  kind   text NOT NULL CHECK (kind IN ('event','member_project','lab_project','competition')),
  status text NOT NULL DEFAULT 'active'
         CHECK (status IN ('planned','active','completed','cancelled')),
  UNIQUE (kind, name)
);

-- 2c. members and their membership periods
CREATE TABLE members (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL CHECK (length(btrim(name)) > 0),
  batch      text,                       -- reserved for batch-based rates later
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE membership_periods (
  id         bigserial PRIMARY KEY,
  member_id  bigint NOT NULL REFERENCES members(id),
  start_date date   NOT NULL,
  end_date   date,                       -- NULL = still a member
  CHECK (end_date IS NULL OR end_date >= start_date),
  EXCLUDE USING gist (member_id WITH =,
                      daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') WITH &&)
);

-- 2d. fee rules: weekly rate history and shutdown weeks
CREATE TABLE fee_rates (
  id             bigserial PRIMARY KEY,
  effective_from date    NOT NULL CHECK (extract(dow FROM effective_from) = 0),   -- a Sunday
  amount         integer NOT NULL CHECK (amount > 0),
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  recorded_by    text    NOT NULL
);
CREATE FUNCTION rate_on(p_sunday date) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT amount FROM fee_rates WHERE effective_from <= p_sunday
   ORDER BY effective_from DESC, id DESC LIMIT 1 $$;

CREATE TABLE shutdown_events (           -- latest event per week wins
  id          bigserial PRIMARY KEY,
  week_start  date    NOT NULL CHECK (extract(dow FROM week_start) = 0),
  is_shutdown boolean NOT NULL,
  reason      text    NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text    NOT NULL
);
CREATE INDEX ON shutdown_events (week_start, id);

-- 2e. non-money member adjustments (+ adds credit, - removes credit)
CREATE TYPE adjustment_kind AS ENUM ('waiver','credit_donation','opening','correction');
CREATE TABLE member_adjustments (
  id          bigserial PRIMARY KEY,
  member_id   bigint  NOT NULL REFERENCES members(id),
  kind        adjustment_kind NOT NULL,
  amount      integer NOT NULL CHECK (amount <> 0),
  occurred_on date    NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text    NOT NULL,
  note        text    NOT NULL DEFAULT '',
  CHECK (kind <> 'waiver'          OR amount > 0),
  CHECK (kind <> 'credit_donation' OR amount < 0),
  CHECK (kind NOT IN ('waiver','correction') OR length(btrim(note)) > 0)
);

-- guards for PART 2
CREATE FUNCTION envelope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bal bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'envelopes cannot be deleted; deactivate them instead'; END IF;
  IF NEW.is_pool IS DISTINCT FROM OLD.is_pool THEN RAISE EXCEPTION 'the pool flag cannot be changed'; END IF;
  IF OLD.active AND NOT NEW.active THEN
    IF OLD.is_pool THEN RAISE EXCEPTION 'the pool cannot be deactivated'; END IF;
    SELECT b.balance INTO bal FROM envelope_balances b WHERE b.id = OLD.id;
    IF bal <> 0 THEN RAISE EXCEPTION 'envelope "%" still holds %; move it out first', OLD.name, bal; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER envelope_guard BEFORE UPDATE OR DELETE ON envelopes
  FOR EACH ROW EXECUTE FUNCTION envelope_guard();

CREATE TRIGGER no_change_rates  BEFORE UPDATE OR DELETE ON fee_rates          FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_change_shut   BEFORE UPDATE OR DELETE ON shutdown_events    FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_change_adj    BEFORE UPDATE OR DELETE ON member_adjustments FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_rates   BEFORE TRUNCATE ON fee_rates          FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_shut    BEFORE TRUNCATE ON shutdown_events    FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_adj     BEFORE TRUNCATE ON member_adjustments FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

CREATE FUNCTION rate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.effective_from < open_tenure_start() THEN
    RAISE EXCEPTION 'a rate cannot start before this tenure opened on %', open_tenure_start(); END IF;
  IF NEW.effective_from < sunday_on_or_before(current_date) THEN
    RAISE EXCEPTION 'a rate cannot be backdated before the current week (%); use a waiver for past weeks',
      sunday_on_or_before(current_date); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rate_guard BEFORE INSERT ON fee_rates FOR EACH ROW EXECUTE FUNCTION rate_guard();

CREATE FUNCTION shutdown_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.week_start < open_tenure_start() THEN
    RAISE EXCEPTION 'week % belongs to a closed tenure', NEW.week_start; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shutdown_guard BEFORE INSERT ON shutdown_events FOR EACH ROW EXECUTE FUNCTION shutdown_guard();

CREATE FUNCTION adj_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.occurred_on < open_tenure_start() THEN
    RAISE EXCEPTION 'adjustments cannot be dated inside a closed tenure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER adj_guard BEFORE INSERT ON member_adjustments FOR EACH ROW EXECUTE FUNCTION adj_guard();

CREATE FUNCTION period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ts date := open_tenure_start(); first_rate date; billable_from date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership periods cannot be deleted; end the membership instead'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT min(effective_from) INTO first_rate FROM fee_rates;
    IF first_rate IS NOT NULL THEN
      billable_from := greatest(sunday_on_or_after(NEW.start_date), first_rate);
      IF billable_from < ts THEN
        RAISE EXCEPTION 'this membership would owe weeks inside a closed tenure; start it on or after % and use a waiver/opening credit', ts;
      END IF;
    END IF;
    IF NEW.end_date IS NOT NULL AND NEW.end_date < ts THEN
      RAISE EXCEPTION 'end date is inside a closed tenure'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.member_id, NEW.start_date) IS DISTINCT FROM (OLD.id, OLD.member_id, OLD.start_date)
     OR OLD.end_date IS NOT NULL OR NEW.end_date IS NULL THEN
    RAISE EXCEPTION 'a membership can only be ended once (set the end date); start dates are not editable'; END IF;
  IF NEW.end_date < ts THEN
    RAISE EXCEPTION 'end date is inside a closed tenure; end on or after % and use a waiver for earlier weeks', ts; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER period_guard BEFORE INSERT OR UPDATE OR DELETE ON membership_periods
  FOR EACH ROW EXECUTE FUNCTION period_guard();

CREATE FUNCTION set_shutdown(p_from_week date, p_to_week date, p_shutdown boolean,
                             p_by text, p_reason text DEFAULT '') RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  IF extract(dow FROM p_from_week) <> 0 OR extract(dow FROM p_to_week) <> 0 THEN
    RAISE EXCEPTION 'weeks start on Sunday'; END IF;
  IF p_to_week < p_from_week THEN RAISE EXCEPTION 'to-week is before from-week'; END IF;
  INSERT INTO shutdown_events(week_start, is_shutdown, reason, recorded_by)
    SELECT g::date, p_shutdown, p_reason, p_by
      FROM generate_series(p_from_week::timestamp, p_to_week::timestamp, interval '7 days') g;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- =====================================================================================
-- PART 3: THE LEDGER (every taka that moves; whole BDT, signed integers)
--   ledger_transactions = the header (what/when/who/why)
--   ledger_lines        = the amounts, one per envelope touched
-- =====================================================================================
CREATE TYPE entry_kind    AS ENUM ('deposit','expense','transfer','sweep','opening','reversal');
CREATE TYPE income_source AS ENUM ('weekly_fee','registration','sponsorship','admin_grant','donation','other');

CREATE TABLE ledger_transactions (
  id             bigserial PRIMARY KEY,
  tenure_id      bigint     NOT NULL REFERENCES tenures(id),
  kind           entry_kind NOT NULL,
  occurred_on    date       NOT NULL,                 -- when it really happened
  recorded_at    timestamptz NOT NULL DEFAULT now(), -- when it was typed in
  recorded_by    text       NOT NULL,
  note           text       NOT NULL DEFAULT '',
  tag            text,
  cost_center_id bigint REFERENCES cost_centers(id),
  source         income_source,                       -- deposits only
  member_id      bigint REFERENCES members(id),       -- fee payment / refund / their reversal
  reverses_id    bigint UNIQUE REFERENCES ledger_transactions(id),
  replaces_id    bigint UNIQUE REFERENCES ledger_transactions(id),
  CHECK ((kind = 'deposit')  = (source IS NOT NULL)),
  CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL)),
  CHECK (kind NOT IN ('transfer','sweep','reversal') OR length(btrim(note)) > 0),
  CONSTRAINT member_link_kinds CHECK (member_id IS NULL OR kind IN ('deposit','expense','reversal')),
  CONSTRAINT fee_needs_member  CHECK (kind <> 'deposit' OR ((source = 'weekly_fee') = (member_id IS NOT NULL))),
  CONSTRAINT sweep_needs_cc    CHECK (kind <> 'sweep' OR cost_center_id IS NOT NULL)
);
CREATE UNIQUE INDEX one_opening_per_tenure ON ledger_transactions (tenure_id) WHERE kind = 'opening';

CREATE TABLE ledger_lines (
  id             bigserial PRIMARY KEY,
  transaction_id bigint  NOT NULL REFERENCES ledger_transactions(id),
  envelope_id    bigint  NOT NULL REFERENCES envelopes(id),
  amount         integer NOT NULL CHECK (amount <> 0),   -- whole BDT, signed
  UNIQUE (transaction_id, envelope_id)
);
CREATE INDEX ON ledger_lines (envelope_id);

CREATE TABLE ledger_label_edits (          -- automatic history of in-place label fixes
  id             bigserial PRIMARY KEY,
  transaction_id bigint NOT NULL REFERENCES ledger_transactions(id),
  field          text   NOT NULL,
  old_value      text,
  new_value      text,
  edited_at      timestamptz NOT NULL DEFAULT now(),
  edited_by      text   NOT NULL
);

-- 3a. what may never change
CREATE TRIGGER no_delete_tx   BEFORE DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_change_ln   BEFORE UPDATE OR DELETE ON ledger_lines FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_change_edits BEFORE UPDATE OR DELETE ON ledger_label_edits FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_tx    BEFORE TRUNCATE ON ledger_transactions FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_ln    BEFORE TRUNCATE ON ledger_lines FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_edits BEFORE TRUNCATE ON ledger_label_edits FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- 3b. a new entry must go into the open tenure; a reversal must be legitimate
CREATE FUNCTION tx_guard() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t tenures%ROWTYPE; o ledger_transactions%ROWTYPE;
BEGIN
  SELECT * INTO t FROM tenures WHERE id = NEW.tenure_id FOR SHARE;
  IF t.closed_on IS NOT NULL THEN
    RAISE EXCEPTION 'tenure "%" is closed; enter an adjustment in the current tenure', t.name;
  END IF;
  IF NEW.occurred_on < t.opened_on THEN
    RAISE EXCEPTION 'date % is before this tenure opened on %', NEW.occurred_on, t.opened_on;
  END IF;
  IF NEW.reverses_id IS NOT NULL THEN
    SELECT * INTO o FROM ledger_transactions WHERE id = NEW.reverses_id;
    IF o.tenure_id <> NEW.tenure_id OR o.kind IN ('reversal','opening') THEN
      RAISE EXCEPTION 'this entry cannot be reversed; enter a new adjustment instead';
    END IF;
    IF o.member_id IS DISTINCT FROM NEW.member_id THEN
      RAISE EXCEPTION 'a reversal must carry the same member as the original';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tx_guard BEFORE INSERT ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION tx_guard();

-- 3c. an envelope can never go below zero (checked under a row lock)
CREATE FUNCTION line_guard() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tid bigint; bal bigint; is_active boolean;
BEGIN
  SELECT active INTO is_active FROM envelopes WHERE id = NEW.envelope_id FOR UPDATE;
  IF NOT is_active THEN RAISE EXCEPTION 'envelope % is inactive', NEW.envelope_id; END IF;
  IF NEW.amount < 0 THEN
    SELECT tenure_id INTO tid FROM ledger_transactions WHERE id = NEW.transaction_id;
    SELECT coalesce(sum(l.amount), 0) INTO bal
      FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
     WHERE l.envelope_id = NEW.envelope_id AND x.tenure_id = tid;
    IF bal + NEW.amount < 0 THEN
      RAISE EXCEPTION 'envelope % would drop below zero (balance %, change %)',
                      NEW.envelope_id, bal, NEW.amount;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER line_guard BEFORE INSERT ON ledger_lines FOR EACH ROW EXECUTE FUNCTION line_guard();

-- 3d. each entry must have the right shape; checked at COMMIT so header+lines can be written together
CREATE FUNCTION check_shape() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tx ledger_transactions%ROWTYPE; tx_id bigint; n int; s bigint; pos int; neg int;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN tx_id := NEW.id; ELSE tx_id := NEW.transaction_id; END IF;
  SELECT * INTO tx FROM ledger_transactions WHERE id = tx_id;
  SELECT count(*), coalesce(sum(amount),0), count(*) FILTER (WHERE amount > 0), count(*) FILTER (WHERE amount < 0)
    INTO n, s, pos, neg FROM ledger_lines WHERE transaction_id = tx_id;
  IF n = 0 THEN RAISE EXCEPTION 'entry % has no amounts', tx_id; END IF;
  IF tx.kind = 'deposit' AND NOT (n = 1 AND pos = 1) THEN
    RAISE EXCEPTION 'a deposit is one positive amount'; END IF;
  IF tx.kind = 'expense' AND NOT (n = 1 AND neg = 1) THEN
    RAISE EXCEPTION 'an expense is one negative amount'; END IF;
  IF tx.kind IN ('transfer','sweep') AND NOT (n >= 2 AND s = 0) THEN
    RAISE EXCEPTION 'a transfer needs two or more lines that sum to zero'; END IF;
  IF tx.kind = 'opening' AND neg > 0 THEN
    RAISE EXCEPTION 'an opening entry cannot be negative'; END IF;
  IF tx.kind = 'reversal' AND EXISTS (
      (SELECT envelope_id, amount FROM ledger_lines WHERE transaction_id = tx_id
       EXCEPT SELECT envelope_id, -amount FROM ledger_lines WHERE transaction_id = tx.reverses_id)
      UNION ALL
      (SELECT envelope_id, -amount FROM ledger_lines WHERE transaction_id = tx.reverses_id
       EXCEPT SELECT envelope_id, amount FROM ledger_lines WHERE transaction_id = tx_id)) THEN
    RAISE EXCEPTION 'a reversal must exactly mirror the original entry'; END IF;
  IF tx.member_id IS NOT NULL AND tx.kind IN ('deposit','expense') AND EXISTS (
      SELECT 1 FROM ledger_lines l JOIN envelopes e ON e.id = l.envelope_id
       WHERE l.transaction_id = tx_id AND NOT e.is_pool) THEN
    RAISE EXCEPTION 'member payments and refunds go through the Unallocated General pool'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER shape_tx AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_shape();
CREATE CONSTRAINT TRIGGER shape_ln AFTER INSERT ON ledger_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_shape();

-- 3e. label fields (note, tag, event/project, date, income type) may be fixed in place, with history
CREATE FUNCTION tx_label_edit() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t tenures%ROWTYPE;
        who text := coalesce(nullif(current_setting('app.actor', true), ''), session_user);
BEGIN
  IF (NEW.id, NEW.tenure_id, NEW.kind, NEW.recorded_at, NEW.recorded_by, NEW.reverses_id, NEW.replaces_id, NEW.member_id)
     IS DISTINCT FROM
     (OLD.id, OLD.tenure_id, OLD.kind, OLD.recorded_at, OLD.recorded_by, OLD.reverses_id, OLD.replaces_id, OLD.member_id) THEN
    RAISE EXCEPTION 'kind, amounts, member and links cannot be edited; use "fix amount" (reversal + replacement)';
  END IF;
  IF OLD.kind = 'opening' THEN RAISE EXCEPTION 'opening entries cannot be edited'; END IF;
  SELECT * INTO t FROM tenures WHERE id = OLD.tenure_id FOR SHARE;
  IF t.closed_on IS NOT NULL THEN RAISE EXCEPTION 'tenure "%" is closed', t.name; END IF;
  IF NEW.occurred_on < t.opened_on THEN
    RAISE EXCEPTION 'date % is before this tenure opened on %', NEW.occurred_on, t.opened_on;
  END IF;
  IF NEW.note IS DISTINCT FROM OLD.note THEN
    INSERT INTO ledger_label_edits(transaction_id, field, old_value, new_value, edited_by)
    VALUES (OLD.id, 'note', OLD.note, NEW.note, who); END IF;
  IF NEW.tag IS DISTINCT FROM OLD.tag THEN
    INSERT INTO ledger_label_edits(transaction_id, field, old_value, new_value, edited_by)
    VALUES (OLD.id, 'tag', OLD.tag, NEW.tag, who); END IF;
  IF NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id THEN
    INSERT INTO ledger_label_edits(transaction_id, field, old_value, new_value, edited_by)
    VALUES (OLD.id, 'cost_center_id', OLD.cost_center_id::text, NEW.cost_center_id::text, who); END IF;
  IF NEW.occurred_on IS DISTINCT FROM OLD.occurred_on THEN
    INSERT INTO ledger_label_edits(transaction_id, field, old_value, new_value, edited_by)
    VALUES (OLD.id, 'occurred_on', OLD.occurred_on::text, NEW.occurred_on::text, who); END IF;
  IF NEW.source IS DISTINCT FROM OLD.source THEN
    INSERT INTO ledger_label_edits(transaction_id, field, old_value, new_value, edited_by)
    VALUES (OLD.id, 'source', OLD.source::text, NEW.source::text, who); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tx_label_edit BEFORE UPDATE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION tx_label_edit();

-- 3f. views you read from
CREATE VIEW envelope_balances AS               -- current-tenure balance of every envelope
SELECT e.id, e.name, e.target_cap, coalesce(sum(l.amount), 0) AS balance
FROM envelopes e
LEFT JOIN (ledger_lines l
           JOIN ledger_transactions x ON x.id = l.transaction_id
           JOIN tenures t ON t.id = x.tenure_id AND t.closed_on IS NULL)
       ON l.envelope_id = e.id
GROUP BY e.id;

CREATE VIEW entries AS                         -- everything, including voided entries and reversals
SELECT x.*, EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.reverses_id = x.id) AS is_voided
FROM ledger_transactions x;

CREATE VIEW entries_current AS                 -- the treasurer's list: corrections collapsed into one line
SELECT x.*, x.replaces_id AS corrected_from
FROM ledger_transactions x
WHERE x.kind <> 'reversal'
  AND NOT EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.reverses_id = x.id);

CREATE FUNCTION ledger_checksum(p_tenure bigint, p_through bigint DEFAULT NULL) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(coalesce(string_agg(
           x.id || ':' || x.kind || ':' || l.envelope_id || ':' || l.amount,
           '|' ORDER BY x.id, l.id), ''), 'UTF8')), 'hex')
    FROM ledger_transactions x JOIN ledger_lines l ON l.transaction_id = x.id
   WHERE x.tenure_id = p_tenure AND (p_through IS NULL OR x.id <= p_through)
$$;

-- =====================================================================================
-- PART 4: DECISIONS (allocation sessions, event leftovers, sweeps)
-- =====================================================================================
CREATE TABLE allocation_sessions (        -- marks which transfers were allocation sessions
  ledger_transaction_id bigint PRIMARY KEY REFERENCES ledger_transactions(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL
);
CREATE TRIGGER no_change_alloc BEFORE UPDATE OR DELETE ON allocation_sessions FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_alloc  BEFORE TRUNCATE ON allocation_sessions FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- the draft: how to split p_amount of the pool. NOTHING is written; the committee edits the numbers.
--   1) capped envelopes (target_cap AND alloc_priority set) are topped up to their cap, lowest priority number first
--   2) what is left is split among uncapped envelopes by shares: p_shares = {"<envelope_id>": share, ...};
--      with no p_shares, the proportions of the last (non-voided) allocation session are reused
--   3) anything not suggested simply stays in the pool
CREATE FUNCTION allocation_suggestion(p_amount integer, p_shares jsonb DEFAULT NULL)
RETURNS TABLE(envelope_id bigint, envelope_name text, balance integer, target_cap integer,
              alloc_priority integer, gap integer, phase text, suggested integer)
LANGUAGE sql STABLE AS $$
WITH env AS (
  SELECT b.id AS eid, b.name AS ename, b.balance::int AS bal, e.target_cap AS cap, e.alloc_priority AS prio,
         CASE WHEN e.target_cap IS NOT NULL AND e.alloc_priority IS NOT NULL
              THEN greatest(e.target_cap - b.balance, 0)::int END AS gp
    FROM envelope_balances b JOIN envelopes e ON e.id = b.id
   WHERE e.active AND NOT e.is_pool
), p1 AS (
  SELECT env.*,
         CASE WHEN gp IS NULL THEN 0
              ELSE least(gp, greatest(p_amount - coalesce(sum(gp) OVER (ORDER BY prio, eid
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0), 0))::int END AS fill
    FROM env
), rest AS (
  SELECT p_amount - coalesce(sum(fill), 0) AS r FROM p1
), last_session AS (
  SELECT max(s.ledger_transaction_id) AS tx FROM allocation_sessions s
   WHERE NOT EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.reverses_id = s.ledger_transaction_id)
), shares AS (
  SELECT p1.eid,
         CASE WHEN p_shares IS NOT NULL THEN coalesce((p_shares ->> p1.eid::text)::numeric, 0)
              ELSE coalesce((SELECT sum(l.amount) FROM ledger_lines l, last_session ls
                              WHERE l.transaction_id = ls.tx AND l.envelope_id = p1.eid AND l.amount > 0), 0)
         END AS sh
    FROM p1 WHERE p1.cap IS NULL
), tot AS (
  SELECT coalesce(sum(sh), 0) AS s FROM shares
), quota AS (
  SELECT sh.eid, (SELECT r FROM rest) * sh.sh / NULLIF((SELECT s FROM tot), 0) AS q
    FROM shares sh WHERE sh.sh > 0
), base AS (
  SELECT eid, q, floor(q)::int AS b FROM quota
), extra AS (
  SELECT eid, b,
         CASE WHEN row_number() OVER (ORDER BY (q - floor(q)) DESC, eid)
                   <= (SELECT r FROM rest) - (SELECT coalesce(sum(b), 0) FROM base) THEN 1 ELSE 0 END AS x
    FROM base
)
SELECT p1.eid, p1.ename, p1.bal, p1.cap, p1.prio, p1.gp,
       CASE WHEN p1.fill > 0 THEN 'cap_fill' WHEN coalesce(ex.b + ex.x, 0) > 0 THEN 'share' ELSE 'none' END,
       (p1.fill + coalesce(ex.b + ex.x, 0))::int
  FROM p1 LEFT JOIN extra ex ON ex.eid = p1.eid
 ORDER BY coalesce(p1.prio, 2147483647), p1.eid
$$;

-- the decision: p_amounts = {"<envelope_id>": amount, ...}; one transfer out of the pool, one session marker.
-- Caps are guidance only: the committee may override them. The pool can never go below zero.
CREATE FUNCTION allocate(p_by text, p_date date, p_note text, p_amounts jsonb) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE t_id bigint; pool_id bigint; total bigint := 0; tx bigint; r record;
BEGIN
  SELECT id INTO t_id FROM tenures WHERE closed_on IS NULL;
  IF t_id IS NULL THEN RAISE EXCEPTION 'no open tenure'; END IF;
  SELECT id INTO pool_id FROM envelopes WHERE is_pool;
  IF pool_id IS NULL THEN RAISE EXCEPTION 'no pool envelope defined'; END IF;
  IF jsonb_typeof(p_amounts) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'amounts must be a JSON object like {"3": 500, "4": 250}'; END IF;
  FOR r IN SELECT key AS k, value AS v FROM jsonb_each_text(p_amounts) LOOP
    IF r.k !~ '^[0-9]+$' OR r.v !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'bad entry "%": "%" (whole positive taka only)', r.k, r.v; END IF;
    IF r.k::bigint = pool_id THEN RAISE EXCEPTION 'the pool cannot be allocated to itself'; END IF;
    IF r.v::bigint = 0 THEN RAISE EXCEPTION 'zero amount for envelope %', r.k; END IF;
    IF NOT EXISTS (SELECT 1 FROM envelopes WHERE id = r.k::bigint AND active) THEN
      RAISE EXCEPTION 'envelope % does not exist or is inactive', r.k; END IF;
    total := total + r.v::bigint;
  END LOOP;
  IF total = 0 THEN RAISE EXCEPTION 'nothing to allocate'; END IF;
  INSERT INTO ledger_transactions(tenure_id, kind, occurred_on, recorded_by, note, tag)
    VALUES (t_id, 'transfer', p_date, p_by, p_note, 'allocation') RETURNING id INTO tx;
  INSERT INTO ledger_lines(transaction_id, envelope_id, amount) VALUES (tx, pool_id, -total);
  INSERT INTO ledger_lines(transaction_id, envelope_id, amount)
    SELECT tx, key::bigint, value::int FROM jsonb_each_text(p_amounts);
  INSERT INTO allocation_sessions(ledger_transaction_id, recorded_by) VALUES (tx, p_by);
  RETURN tx;
END $$;

-- money in / out / swept / leftover per event or project (voided entries cancel out automatically)
CREATE VIEW cost_center_summary AS
WITH eff AS (
  SELECT CASE WHEN x.kind = 'reversal' THEN o.cost_center_id ELSE x.cost_center_id END AS cc,
         CASE WHEN x.kind = 'reversal' THEN o.kind ELSE x.kind END AS base_kind,
         (x.kind = 'reversal') AS is_rev,
         coalesce(sum(l.amount), 0) AS net,
         coalesce(sum(l.amount) FILTER (WHERE l.amount > 0), 0) AS pos,
         coalesce(sum(l.amount) FILTER (WHERE l.amount < 0), 0) AS neg
    FROM ledger_transactions x
    LEFT JOIN ledger_transactions o ON o.id = x.reverses_id
    JOIN ledger_lines l ON l.transaction_id = x.id
   GROUP BY x.id, o.id
), sums AS (
  SELECT c.id AS cost_center_id, c.name, c.kind, c.status,
         coalesce(sum(e.net) FILTER (WHERE e.base_kind = 'deposit'), 0)::int AS money_in,
         (-coalesce(sum(e.net) FILTER (WHERE e.base_kind = 'expense'), 0))::int AS money_out,
         coalesce(sum(CASE WHEN e.is_rev THEN -e.pos ELSE -e.neg END) FILTER (WHERE e.base_kind = 'sweep'), 0)::int AS swept
    FROM cost_centers c LEFT JOIN eff e ON e.cc = c.id
   GROUP BY c.id
)
SELECT s.*, (s.money_in - s.money_out - s.swept) AS leftover FROM sums s;

-- move an event's leftover out of the envelope that holds it, back into the pool
CREATE FUNCTION sweep_leftover(p_cc bigint, p_from_envelope bigint, p_by text, p_date date, p_note text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE t_id bigint; pool_id bigint; lo int; tx bigint;
BEGIN
  SELECT id INTO t_id FROM tenures WHERE closed_on IS NULL;
  IF t_id IS NULL THEN RAISE EXCEPTION 'no open tenure'; END IF;
  SELECT id INTO pool_id FROM envelopes WHERE is_pool;
  IF p_from_envelope = pool_id THEN RAISE EXCEPTION 'sweep from an envelope other than the pool'; END IF;
  SELECT s.leftover INTO lo FROM cost_center_summary s WHERE s.cost_center_id = p_cc;
  IF lo IS NULL OR lo <= 0 THEN RAISE EXCEPTION 'nothing to sweep (leftover is %)', coalesce(lo, 0); END IF;
  INSERT INTO ledger_transactions(tenure_id, kind, occurred_on, recorded_by, note, cost_center_id)
    VALUES (t_id, 'sweep', p_date, p_by, p_note, p_cc) RETURNING id INTO tx;
  INSERT INTO ledger_lines(transaction_id, envelope_id, amount) VALUES (tx, p_from_envelope, -lo), (tx, pool_id, lo);
  RETURN tx;
END $$;

-- =====================================================================================
-- PART 5: DUES  (nothing is stored; every number is computed from the rules and the ledger)
--   owed    = weeks the member's period covers (by Sunday), not shut down, at the rate of that week
--   credits = fee payments - refunds (ledger entries with member_id) + adjustments
--   balance = credits - owed   (positive = credit, negative = arrears)
-- =====================================================================================
CREATE FUNCTION member_standing(p_as_of date DEFAULT current_date)
RETURNS TABLE(who_id bigint, who_name text, is_member_now boolean, weeks_owed int, owed int,
              credits int, balance int, weeks_overdue int, oldest_unpaid_week date)
LANGUAGE sql STABLE AS $$
WITH bounds AS (
  SELECT min(effective_from) AS first_week, sunday_on_or_before(p_as_of) AS last_week FROM fee_rates
), weeks AS (
  SELECT g::date AS wk
    FROM bounds, generate_series(bounds.first_week::timestamp, bounds.last_week::timestamp, interval '7 days') g
   WHERE bounds.first_week IS NOT NULL
), billable AS (
  SELECT wk FROM weeks w
   WHERE NOT coalesce((SELECT s.is_shutdown FROM shutdown_events s
                        WHERE s.week_start = w.wk ORDER BY s.id DESC LIMIT 1), false)
), owed_weeks AS (
  SELECT mp.member_id, b.wk, rate_on(b.wk) AS rate
    FROM membership_periods mp
    JOIN billable b ON b.wk BETWEEN mp.start_date AND coalesce(mp.end_date, 'infinity'::date)
), running AS (
  SELECT member_id, wk, rate, sum(rate) OVER (PARTITION BY member_id ORDER BY wk) AS cum_owed
    FROM owed_weeks
), cash AS (
  SELECT x.member_id, sum(l.amount) AS amt
    FROM ledger_transactions x JOIN ledger_lines l ON l.transaction_id = x.id
   WHERE x.member_id IS NOT NULL AND x.occurred_on <= p_as_of GROUP BY 1
), adj AS (
  SELECT member_id, sum(amount) AS amt FROM member_adjustments
   WHERE occurred_on <= p_as_of GROUP BY 1
), tot AS (
  SELECT m.id AS mid, m.name AS mname,
         (SELECT count(*) FROM running r WHERE r.member_id = m.id) AS n_weeks,
         coalesce((SELECT sum(r.rate) FROM running r WHERE r.member_id = m.id), 0) AS owed_amt,
         coalesce((SELECT c.amt FROM cash c WHERE c.member_id = m.id), 0)
           + coalesce((SELECT a.amt FROM adj a WHERE a.member_id = m.id), 0) AS credit_amt,
         EXISTS (SELECT 1 FROM membership_periods mp WHERE mp.member_id = m.id
                  AND p_as_of BETWEEN mp.start_date AND coalesce(mp.end_date, 'infinity'::date)) AS now_member
    FROM members m
)
SELECT t.mid, t.mname, t.now_member, t.n_weeks::int, t.owed_amt::int, t.credit_amt::int,
       (t.credit_amt - t.owed_amt)::int,
       (SELECT count(*) FROM running r WHERE r.member_id = t.mid AND r.cum_owed > t.credit_amt)::int,
       (SELECT min(r.wk) FROM running r WHERE r.member_id = t.mid AND r.cum_owed > t.credit_amt)
  FROM tot t
$$;

CREATE VIEW dues_overview AS
SELECT * FROM member_standing() ORDER BY weeks_overdue DESC, who_name;

CREATE VIEW allocation_context AS         -- what the allocation screen shows next to the pool balance
SELECT (SELECT b.balance FROM envelope_balances b JOIN envelopes e ON e.id = b.id WHERE e.is_pool)::int AS pool_balance,
       (SELECT coalesce(sum(s.balance), 0) FROM member_standing() s WHERE s.balance > 0)::int AS member_credit_held,
       ((SELECT b.balance FROM envelope_balances b JOIN envelopes e ON e.id = b.id WHERE e.is_pool)
        - (SELECT coalesce(sum(s.balance), 0) FROM member_standing() s WHERE s.balance > 0))::int AS pool_after_member_credit;

-- =====================================================================================
-- PART 6: ASSETS
-- =====================================================================================
CREATE TYPE asset_mode  AS ENUM ('individual','counted');   -- one unit per row / a quantity per row
CREATE TYPE asset_owner AS ENUM ('lab','admin');

CREATE TABLE assets (                      -- consumables (resistors...) never get a row
  id         bigserial PRIMARY KEY,
  name       text NOT NULL CHECK (length(btrim(name)) > 0),
  mode       asset_mode  NOT NULL,
  ownership  asset_owner NOT NULL,
  tag        text,                          -- admin inventory tag / lab tag / serial
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assets_tag_unique ON assets (lower(tag)) WHERE tag IS NOT NULL;

CREATE TYPE asset_event_kind AS ENUM
  ('acquired','lent','returned','damaged','lost','repaired','scrapped','exchanged','correction');
CREATE TYPE acquire_source AS ENUM ('purchase','admin','project_return','donation','replacement','other');

CREATE TABLE asset_events (
  id                    bigserial PRIMARY KEY,
  asset_id              bigint  NOT NULL REFERENCES assets(id),
  kind                  asset_event_kind NOT NULL,
  quantity              integer NOT NULL CHECK (quantity <> 0),
  member_id             bigint REFERENCES members(id),   -- borrower; for damaged/lost: the member who had it
  cost_center_id        bigint REFERENCES cost_centers(id),
  occurred_on           date    NOT NULL,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  recorded_by           text    NOT NULL,
  note                  text    NOT NULL DEFAULT '',
  source                acquire_source,                  -- acquired only
  ledger_transaction_id bigint REFERENCES ledger_transactions(id),  -- optional purchase link
  reverses_id           bigint UNIQUE REFERENCES asset_events(id),
  replaces_id           bigint UNIQUE REFERENCES asset_events(id),
  CHECK ((kind = 'acquired') = (source IS NOT NULL)),
  CHECK (ledger_transaction_id IS NULL OR kind = 'acquired'),
  CHECK ((kind IN ('lent','returned') AND member_id IS NOT NULL)
      OR (kind IN ('damaged','lost'))
      OR (kind NOT IN ('lent','returned','damaged','lost') AND member_id IS NULL)),
  CHECK (reverses_id IS NOT NULL OR quantity > 0 OR kind = 'correction'),
  CHECK (kind NOT IN ('damaged','lost','scrapped','exchanged','correction')
         OR length(btrim(note)) > 0),
  CHECK (reverses_id IS NULL OR length(btrim(note)) > 0)
);
CREATE INDEX ON asset_events (asset_id);
CREATE INDEX ON asset_events (member_id);

CREATE TABLE asset_label_edits (
  id         bigserial PRIMARY KEY,
  event_id   bigint NOT NULL REFERENCES asset_events(id),
  field      text   NOT NULL,
  old_value  text,
  new_value  text,
  edited_at  timestamptz NOT NULL DEFAULT now(),
  edited_by  text   NOT NULL
);

-- what each event does to the counts; a reversal is the same kind with the negated quantity
CREATE VIEW asset_event_effects AS
SELECT e.*,
  CASE e.kind WHEN 'acquired' THEN e.quantity WHEN 'returned' THEN e.quantity
              WHEN 'repaired' THEN e.quantity WHEN 'correction' THEN e.quantity
              WHEN 'lent' THEN -e.quantity
              WHEN 'damaged' THEN CASE WHEN e.member_id IS NULL THEN -e.quantity ELSE 0 END
              WHEN 'lost'    THEN CASE WHEN e.member_id IS NULL THEN -e.quantity ELSE 0 END
              ELSE 0 END AS stock_d,
  CASE e.kind WHEN 'damaged' THEN e.quantity
              WHEN 'repaired' THEN -e.quantity WHEN 'scrapped' THEN -e.quantity
              WHEN 'exchanged' THEN -e.quantity ELSE 0 END AS damaged_d,
  CASE WHEN e.kind = 'lost'      THEN e.quantity ELSE 0 END AS lost_d,
  CASE WHEN e.kind = 'scrapped'  THEN e.quantity ELSE 0 END AS scrapped_d,
  CASE WHEN e.kind = 'exchanged' THEN e.quantity ELSE 0 END AS exchanged_d,
  CASE e.kind WHEN 'lent' THEN e.quantity WHEN 'returned' THEN -e.quantity
              WHEN 'damaged' THEN CASE WHEN e.member_id IS NOT NULL THEN -e.quantity ELSE 0 END
              WHEN 'lost'    THEN CASE WHEN e.member_id IS NOT NULL THEN -e.quantity ELSE 0 END
              ELSE 0 END AS held_d
FROM asset_events e;

CREATE FUNCTION asset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'assets cannot be deleted'; END IF;
  IF (NEW.mode, NEW.ownership) IS DISTINCT FROM (OLD.mode, OLD.ownership)
     AND EXISTS (SELECT 1 FROM asset_events WHERE asset_id = OLD.id) THEN
    RAISE EXCEPTION 'mode and ownership cannot change once an asset has events; create a new asset';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION asset_event_guard() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ts date := open_tenure_start(); a assets%ROWTYPE; o asset_events%ROWTYPE;
BEGIN
  IF NEW.occurred_on < ts THEN
    RAISE EXCEPTION 'events cannot be dated inside a closed tenure (before %)', ts; END IF;
  SELECT * INTO a FROM assets WHERE id = NEW.asset_id;
  IF a.mode = 'individual' AND abs(NEW.quantity) <> 1 THEN
    RAISE EXCEPTION 'an individually tracked asset moves one unit at a time'; END IF;
  IF NEW.kind IN ('lent','returned') AND NEW.member_id IS NULL THEN
    RAISE EXCEPTION 'lending and returning need a member'; END IF;
  IF NEW.kind = 'lent' AND NEW.quantity > 0 AND NOT EXISTS (
       SELECT 1 FROM membership_periods mp WHERE mp.member_id = NEW.member_id
          AND NEW.occurred_on BETWEEN mp.start_date AND coalesce(mp.end_date, 'infinity'::date)) THEN
    RAISE EXCEPTION 'only a current member can borrow; lend it in a member''s name and put the project in the note';
  END IF;
  IF NEW.reverses_id IS NOT NULL THEN
    SELECT * INTO o FROM asset_events WHERE id = NEW.reverses_id;
    IF o.reverses_id IS NOT NULL OR o.occurred_on < ts THEN
      RAISE EXCEPTION 'this event cannot be reversed; enter a correction instead'; END IF;
    IF (o.asset_id, o.kind, o.member_id, o.source)
         IS DISTINCT FROM (NEW.asset_id, NEW.kind, NEW.member_id, NEW.source)
       OR o.quantity <> -NEW.quantity THEN
      RAISE EXCEPTION 'a reversal must mirror the original event'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION asset_bucket_check() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a assets%ROWTYPE; st int; dm int; ls int; sc int; ex int; held_all int; held_m int;
BEGIN
  SELECT * INTO a FROM assets WHERE id = NEW.asset_id FOR UPDATE;
  SELECT coalesce(sum(stock_d),0), coalesce(sum(damaged_d),0), coalesce(sum(lost_d),0),
         coalesce(sum(scrapped_d),0), coalesce(sum(exchanged_d),0), coalesce(sum(held_d),0)
    INTO st, dm, ls, sc, ex, held_all
    FROM asset_event_effects WHERE asset_id = NEW.asset_id;
  IF st < 0 THEN RAISE EXCEPTION 'not enough in stock: short by %', -st; END IF;
  IF dm < 0 THEN RAISE EXCEPTION 'fewer damaged units than that: short by %', -dm; END IF;
  IF ls < 0 OR sc < 0 OR ex < 0 THEN
    RAISE EXCEPTION 'this would make a lost / scrapped / exchanged count negative'; END IF;
  IF NEW.member_id IS NOT NULL THEN
    SELECT coalesce(sum(held_d),0) INTO held_m FROM asset_event_effects
     WHERE asset_id = NEW.asset_id AND member_id = NEW.member_id;
    IF held_m < 0 THEN RAISE EXCEPTION 'that member holds fewer units than that: short by %', -held_m; END IF;
  END IF;
  IF a.mode = 'individual' AND st + dm + held_all > 1 THEN
    RAISE EXCEPTION 'an individually tracked asset can only exist once'; END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION asset_event_edit() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ts date := open_tenure_start();
        who text := coalesce(nullif(current_setting('app.actor', true), ''), session_user);
BEGIN
  IF (NEW.id, NEW.asset_id, NEW.kind, NEW.quantity, NEW.member_id, NEW.recorded_at, NEW.recorded_by,
      NEW.source, NEW.ledger_transaction_id, NEW.reverses_id, NEW.replaces_id)
     IS DISTINCT FROM
     (OLD.id, OLD.asset_id, OLD.kind, OLD.quantity, OLD.member_id, OLD.recorded_at, OLD.recorded_by,
      OLD.source, OLD.ledger_transaction_id, OLD.reverses_id, OLD.replaces_id) THEN
    RAISE EXCEPTION 'asset, kind, quantity and member cannot be edited; reverse and re-enter';
  END IF;
  IF OLD.occurred_on < ts THEN RAISE EXCEPTION 'this event belongs to a closed tenure'; END IF;
  IF NEW.occurred_on < ts THEN
    RAISE EXCEPTION 'date % is before this tenure opened on %', NEW.occurred_on, ts; END IF;
  IF NEW.note IS DISTINCT FROM OLD.note THEN
    INSERT INTO asset_label_edits(event_id, field, old_value, new_value, edited_by)
    VALUES (OLD.id, 'note', OLD.note, NEW.note, who); END IF;
  IF NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id THEN
    INSERT INTO asset_label_edits(event_id, field, old_value, new_value, edited_by)
    VALUES (OLD.id, 'cost_center_id', OLD.cost_center_id::text, NEW.cost_center_id::text, who); END IF;
  IF NEW.occurred_on IS DISTINCT FROM OLD.occurred_on THEN
    INSERT INTO asset_label_edits(event_id, field, old_value, new_value, edited_by)
    VALUES (OLD.id, 'occurred_on', OLD.occurred_on::text, NEW.occurred_on::text, who); END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER asset_guard         BEFORE UPDATE OR DELETE ON assets FOR EACH ROW EXECUTE FUNCTION asset_guard();
CREATE TRIGGER asset_event_guard   BEFORE INSERT ON asset_events FOR EACH ROW EXECUTE FUNCTION asset_event_guard();
CREATE TRIGGER asset_event_edit    BEFORE UPDATE ON asset_events FOR EACH ROW EXECUTE FUNCTION asset_event_edit();
CREATE TRIGGER asset_bucket_check  AFTER INSERT ON asset_events FOR EACH ROW EXECUTE FUNCTION asset_bucket_check();
CREATE TRIGGER no_delete_asset_ev  BEFORE DELETE ON asset_events FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_asset_ev   BEFORE TRUNCATE ON asset_events FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_change_asset_led BEFORE UPDATE OR DELETE ON asset_label_edits FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_asset_led  BEFORE TRUNCATE ON asset_label_edits FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

CREATE VIEW asset_events_current AS            -- corrections collapsed into one line
SELECT e.*, e.replaces_id AS corrected_from
FROM asset_events e
WHERE e.reverses_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM asset_events r WHERE r.reverses_id = e.id);

CREATE FUNCTION asset_state(p_as_of date DEFAULT 'infinity'::date)
RETURNS TABLE(asset_id bigint, asset_name text, ownership asset_owner, mode asset_mode, tag text,
              stock int, damaged int, with_members int, lost int, scrapped int, exchanged int)
LANGUAGE sql STABLE AS $$
SELECT a.id, a.name, a.ownership, a.mode, a.tag,
       coalesce(sum(f.stock_d), 0)::int, coalesce(sum(f.damaged_d), 0)::int, coalesce(sum(f.held_d), 0)::int,
       coalesce(sum(f.lost_d), 0)::int, coalesce(sum(f.scrapped_d), 0)::int, coalesce(sum(f.exchanged_d), 0)::int
  FROM assets a
  LEFT JOIN asset_event_effects f ON f.asset_id = a.id AND f.occurred_on <= p_as_of
 GROUP BY a.id
 ORDER BY a.name
$$;

CREATE FUNCTION asset_holdings(p_as_of date DEFAULT 'infinity'::date)
RETURNS TABLE(asset_id bigint, asset_name text, member_id bigint, member_name text, quantity int)
LANGUAGE sql STABLE AS $$
SELECT f.asset_id, a.name, f.member_id, m.name, sum(f.held_d)::int
  FROM asset_event_effects f
  JOIN assets a ON a.id = f.asset_id
  JOIN members m ON m.id = f.member_id
 WHERE f.occurred_on <= p_as_of AND f.member_id IS NOT NULL
 GROUP BY f.asset_id, a.name, f.member_id, m.name
HAVING sum(f.held_d) <> 0
$$;

CREATE VIEW asset_overview AS SELECT * FROM asset_state();
CREATE VIEW who_has_what   AS SELECT * FROM asset_holdings() ORDER BY member_name, asset_name;
CREATE VIEW admin_replacement_queue AS             -- admin-owned items waiting to be exchanged
SELECT * FROM asset_state() WHERE ownership = 'admin' AND damaged > 0;

CREATE FUNCTION asset_activity(p_from date, p_to date)     -- raw numbers for the admin report (export to CSV)
RETURNS TABLE(asset_name text, ownership asset_owner, kind asset_event_kind, source acquire_source,
              units int, events int)
LANGUAGE sql STABLE AS $$
SELECT a.name, a.ownership, e.kind, e.source, sum(e.quantity)::int, count(*)::int
  FROM asset_events_current e JOIN assets a ON a.id = e.asset_id
 WHERE e.occurred_on BETWEEN p_from AND p_to
 GROUP BY a.name, a.ownership, e.kind, e.source
 ORDER BY 1, 3
$$;

-- =====================================================================================
-- PART 7: HANDOVER  (close_tenure: lock history, save snapshots, carry balances over)
-- =====================================================================================
CREATE TABLE tenure_member_snapshots (
  tenure_id     bigint  NOT NULL REFERENCES tenures(id),
  member_id     bigint  NOT NULL REFERENCES members(id),
  as_of         date    NOT NULL,
  weeks_owed    integer NOT NULL,
  owed          integer NOT NULL,
  credits       integer NOT NULL,
  balance       integer NOT NULL,
  weeks_overdue integer NOT NULL,
  PRIMARY KEY (tenure_id, member_id)
);
CREATE TABLE tenure_asset_snapshots (
  tenure_id bigint NOT NULL REFERENCES tenures(id),
  asset_id  bigint NOT NULL REFERENCES assets(id),
  as_of     date   NOT NULL,
  stock     integer NOT NULL, damaged integer NOT NULL, held integer NOT NULL,
  lost      integer NOT NULL, scrapped integer NOT NULL, exchanged integer NOT NULL,
  PRIMARY KEY (tenure_id, asset_id)
);
CREATE TABLE tenure_holding_snapshots (
  tenure_id bigint NOT NULL REFERENCES tenures(id),
  asset_id  bigint NOT NULL REFERENCES assets(id),
  member_id bigint NOT NULL REFERENCES members(id),
  quantity  integer NOT NULL,
  PRIMARY KEY (tenure_id, asset_id, member_id)
);
CREATE TRIGGER no_change_snap  BEFORE UPDATE OR DELETE ON tenure_member_snapshots FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_snap   BEFORE TRUNCATE ON tenure_member_snapshots FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_change_asnap BEFORE UPDATE OR DELETE ON tenure_asset_snapshots FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_asnap  BEFORE TRUNCATE ON tenure_asset_snapshots FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_change_hsnap BEFORE UPDATE OR DELETE ON tenure_holding_snapshots FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_hsnap  BEFORE TRUNCATE ON tenure_holding_snapshots FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

CREATE FUNCTION snapshot_assets() RETURNS trigger LANGUAGE plpgsql          -- fires when a tenure gets its closed_on
SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO tenure_asset_snapshots
    SELECT NEW.id, s.asset_id, NEW.closed_on, s.stock, s.damaged, s.with_members, s.lost, s.scrapped, s.exchanged
      FROM asset_state(NEW.closed_on) s;
  INSERT INTO tenure_holding_snapshots
    SELECT NEW.id, h.asset_id, h.member_id, h.quantity FROM asset_holdings(NEW.closed_on) h;
  RETURN NULL;
END $$;
CREATE TRIGGER snapshot_assets AFTER UPDATE ON tenures
  FOR EACH ROW WHEN (OLD.closed_on IS NULL AND NEW.closed_on IS NOT NULL)
  EXECUTE FUNCTION snapshot_assets();

CREATE FUNCTION close_tenure(p_close_on date, p_by text, p_next_name text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t tenures%ROWTYPE; last_date date; new_id bigint; opening_id bigint;
BEGIN
  SELECT * INTO t FROM tenures WHERE closed_on IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no open tenure'; END IF;
  SELECT max(occurred_on) INTO last_date FROM ledger_transactions WHERE tenure_id = t.id;
  IF p_close_on < t.opened_on OR p_close_on < coalesce(last_date, t.opened_on) THEN
    RAISE EXCEPTION 'close date % is before the last recorded entry (%)', p_close_on, last_date;
  END IF;
  UPDATE tenures SET closed_on = p_close_on, closed_at = now(),
         closing_checksum = ledger_checksum(t.id) WHERE id = t.id;      -- also fires snapshot_assets
  INSERT INTO tenure_member_snapshots
    SELECT t.id, s.who_id, p_close_on, s.weeks_owed, s.owed, s.credits, s.balance, s.weeks_overdue
      FROM member_standing(p_close_on) s;
  INSERT INTO tenures(name, opened_on) VALUES (p_next_name, p_close_on + 1) RETURNING id INTO new_id;
  IF EXISTS (SELECT 1 FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
              WHERE x.tenure_id = t.id) THEN
    INSERT INTO ledger_transactions(tenure_id, kind, occurred_on, recorded_by, note)
      VALUES (new_id, 'opening', p_close_on + 1, p_by, 'Carry-over from ' || t.name)
      RETURNING id INTO opening_id;
    INSERT INTO ledger_lines(transaction_id, envelope_id, amount)
      SELECT opening_id, l.envelope_id, sum(l.amount)
        FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
       WHERE x.tenure_id = t.id
       GROUP BY l.envelope_id HAVING sum(l.amount) <> 0;
  END IF;
  RETURN new_id;
END $$;

-- =====================================================================================
-- PART 8: TRUST  (health checks + the app's limited login)
-- =====================================================================================
CREATE FUNCTION verify_integrity() RETURNS TABLE(problem text) LANGUAGE sql STABLE AS $$
  SELECT 'tenure "' || name || '": money data differs from the checksum saved at close'
    FROM tenures WHERE closed_on IS NOT NULL AND closing_checksum <> ledger_checksum(id)
  UNION ALL
  SELECT 'tenure "' || t.name || '": envelope "' || e.name || '" is below zero (' || s.bal || ')'
    FROM (SELECT x.tenure_id, l.envelope_id, sum(l.amount) AS bal
            FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
           GROUP BY 1, 2 HAVING sum(l.amount) < 0) s
    JOIN tenures t ON t.id = s.tenure_id JOIN envelopes e ON e.id = s.envelope_id
  UNION ALL
  SELECT 'entry ' || x.id || ' (' || x.kind || '): has no amounts'
    FROM ledger_transactions x
   WHERE NOT EXISTS (SELECT 1 FROM ledger_lines l WHERE l.transaction_id = x.id)
  UNION ALL
  SELECT 'entry ' || x.id || ' (' || x.kind || '): wrong shape'
    FROM ledger_transactions x
    JOIN (SELECT transaction_id, count(*) AS n, sum(amount) AS s,
                 count(*) FILTER (WHERE amount > 0) AS p, count(*) FILTER (WHERE amount < 0) AS g
            FROM ledger_lines GROUP BY 1) a ON a.transaction_id = x.id
   WHERE (x.kind = 'deposit' AND NOT (a.n = 1 AND a.p = 1))
      OR (x.kind = 'expense' AND NOT (a.n = 1 AND a.g = 1))
      OR (x.kind IN ('transfer','sweep') AND NOT (a.n >= 2 AND a.s = 0))
      OR (x.kind = 'opening' AND a.g > 0)
  UNION ALL
  SELECT 'tenure "' || t.name || '": opening for "' || e.name || '" is ' || coalesce(o.amt, 0)
         || ' but the previous tenure closed with ' || coalesce(c.bal, 0)
    FROM tenures t
    JOIN tenures p ON p.closed_on + 1 = t.opened_on
    CROSS JOIN envelopes e
    LEFT JOIN LATERAL (SELECT sum(l.amount) AS bal FROM ledger_lines l
            JOIN ledger_transactions x ON x.id = l.transaction_id
           WHERE x.tenure_id = p.id AND l.envelope_id = e.id) c ON true
    LEFT JOIN LATERAL (SELECT sum(l.amount) AS amt FROM ledger_lines l
            JOIN ledger_transactions x ON x.id = l.transaction_id
           WHERE x.tenure_id = t.id AND x.kind = 'opening' AND l.envelope_id = e.id) o ON true
   WHERE coalesce(o.amt, 0) <> coalesce(c.bal, 0)
  UNION ALL
  SELECT 'tenure "' || t.name || '": dues of "' || cur.who_name || '" were ' || snap.balance
         || ' at close but now compute to ' || cur.balance
    FROM (SELECT * FROM tenures WHERE closed_on IS NOT NULL) t
    JOIN LATERAL member_standing(t.closed_on) cur ON true
    JOIN tenure_member_snapshots snap ON snap.tenure_id = t.id AND snap.member_id = cur.who_id
   WHERE snap.balance <> cur.balance OR snap.owed <> cur.owed
$$;

CREATE FUNCTION verify_assets() RETURNS TABLE(problem text) LANGUAGE sql STABLE AS $$
  SELECT 'tenure "' || t.name || '": asset "' || cur.asset_name
         || '" changed after close (stock/damaged/with members/lost/scrapped/exchanged were '
         || s.stock || '/' || s.damaged || '/' || s.held || '/' || s.lost || '/' || s.scrapped || '/' || s.exchanged
         || ', now ' || cur.stock || '/' || cur.damaged || '/' || cur.with_members || '/' || cur.lost
         || '/' || cur.scrapped || '/' || cur.exchanged || ')'
    FROM (SELECT * FROM tenures WHERE closed_on IS NOT NULL) t
    JOIN LATERAL asset_state(t.closed_on) cur ON true
    JOIN tenure_asset_snapshots s ON s.tenure_id = t.id AND s.asset_id = cur.asset_id
   WHERE (s.stock, s.damaged, s.held, s.lost, s.scrapped, s.exchanged)
         IS DISTINCT FROM (cur.stock, cur.damaged, cur.with_members, cur.lost, cur.scrapped, cur.exchanged)
  UNION ALL
  SELECT 'tenure "' || t.name || '": who-holds-what differs from the saved handover register'
    FROM (SELECT * FROM tenures WHERE closed_on IS NOT NULL) t
   WHERE EXISTS (
     (SELECT asset_id, member_id, quantity FROM tenure_holding_snapshots WHERE tenure_id = t.id
      EXCEPT SELECT asset_id, member_id, quantity FROM asset_holdings(t.closed_on))
     UNION ALL
     (SELECT asset_id, member_id, quantity FROM asset_holdings(t.closed_on)
      EXCEPT SELECT asset_id, member_id, quantity FROM tenure_holding_snapshots WHERE tenure_id = t.id))
  UNION ALL
  SELECT 'asset "' || asset_name || '": impossible counts'
    FROM asset_state()
   WHERE stock < 0 OR damaged < 0 OR with_members < 0 OR lost < 0 OR scrapped < 0 OR exchanged < 0
      OR (mode = 'individual' AND stock + damaged + with_members > 1)
$$;

-- ---- 8a. RECONCILIATION: "I counted my money / checked my notes and it matches the screen" ----
-- Each check records what the screen said and what you counted, as of the newest entry then recorded.
-- After a MATCH you only ever need to review the entries recorded after it (see unverified_entries).
CREATE TABLE reconciliations (
  id               bigserial PRIMARY KEY,
  tenure_id        bigint  NOT NULL REFERENCES tenures(id),
  through_entry_id bigint  NOT NULL REFERENCES ledger_transactions(id),  -- newest entry the screen showed
  checked_on       date    NOT NULL,
  system_total     integer NOT NULL,                  -- the screen: all envelopes together
  counted_total    integer NOT NULL CHECK (counted_total >= 0),   -- what you actually have / your notes say
  difference       integer NOT NULL,                  -- counted - system
  matched          boolean NOT NULL,                  -- total matched AND every envelope you counted matched
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  recorded_by      text    NOT NULL,
  note             text    NOT NULL DEFAULT '',
  CHECK (difference = counted_total - system_total),
  CHECK (NOT matched OR difference = 0)
);
CREATE TABLE reconciliation_envelopes (             -- optional: per-envelope counts from your notes
  reconciliation_id bigint  NOT NULL REFERENCES reconciliations(id),
  envelope_id       bigint  NOT NULL REFERENCES envelopes(id),
  system_balance    integer NOT NULL,
  counted           integer NOT NULL CHECK (counted >= 0),
  PRIMARY KEY (reconciliation_id, envelope_id)
);
CREATE TRIGGER no_change_rec  BEFORE UPDATE OR DELETE ON reconciliations FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_rec   BEFORE TRUNCATE ON reconciliations FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_change_recenv BEFORE UPDATE OR DELETE ON reconciliation_envelopes FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER no_trunc_recenv  BEFORE TRUNCATE ON reconciliation_envelopes FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- the only way to record a check (the app has no direct INSERT right on the tables above)
-- p_counted optional: {"<envelope_id>": counted, ...}. A match needs the total AND every envelope given to agree.
CREATE FUNCTION reconcile(p_by text, p_counted_total integer, p_note text DEFAULT '',
                          p_counted jsonb DEFAULT NULL, p_date date DEFAULT current_date) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t_id bigint; thru bigint; sys int; ok boolean; rid bigint; r record; sysbal int;
BEGIN
  SELECT id INTO t_id FROM tenures WHERE closed_on IS NULL;
  IF t_id IS NULL THEN RAISE EXCEPTION 'no open tenure'; END IF;
  SELECT max(x.id) INTO thru FROM ledger_transactions x WHERE x.tenure_id = t_id;
  IF thru IS NULL THEN RAISE EXCEPTION 'nothing to reconcile yet'; END IF;
  SELECT coalesce(sum(l.amount), 0)::int INTO sys
    FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
   WHERE x.tenure_id = t_id AND x.id <= thru;
  ok := (p_counted_total = sys);
  IF p_counted IS NOT NULL THEN
    IF jsonb_typeof(p_counted) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'counted amounts must be a JSON object like {"1": 2500, "3": 400}'; END IF;
    FOR r IN SELECT key AS k, value AS v FROM jsonb_each_text(p_counted) LOOP
      IF r.k !~ '^[0-9]+$' OR r.v !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'bad entry "%": "%" (whole taka, no minus)', r.k, r.v; END IF;
      IF NOT EXISTS (SELECT 1 FROM envelopes WHERE id = r.k::bigint) THEN
        RAISE EXCEPTION 'envelope % does not exist', r.k; END IF;
      SELECT coalesce(sum(l.amount), 0)::int INTO sysbal
        FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
       WHERE x.tenure_id = t_id AND x.id <= thru AND l.envelope_id = r.k::bigint;
      IF sysbal <> r.v::int THEN ok := false; END IF;
    END LOOP;
  END IF;
  INSERT INTO reconciliations(tenure_id, through_entry_id, checked_on, system_total, counted_total,
                              difference, matched, recorded_by, note)
    VALUES (t_id, thru, p_date, sys, p_counted_total, p_counted_total - sys, ok, p_by, p_note)
    RETURNING id INTO rid;
  IF p_counted IS NOT NULL THEN
    INSERT INTO reconciliation_envelopes(reconciliation_id, envelope_id, system_balance, counted)
    SELECT rid, e.id,
           coalesce((SELECT sum(l.amount) FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
                      WHERE x.tenure_id = t_id AND x.id <= thru AND l.envelope_id = e.id), 0)::int,
           c.value::int
      FROM jsonb_each_text(p_counted) c JOIN envelopes e ON e.id = c.key::bigint;
  END IF;
  RETURN rid;
END $$;

CREATE VIEW last_match AS                       -- the most recent check that fully matched (0 or 1 row)
SELECT r.* FROM reconciliations r WHERE r.matched ORDER BY r.id DESC LIMIT 1;

-- everything recorded AFTER the last match: the only entries you need to review when numbers disagree.
-- (ordered by when it was RECORDED, so a late entry for an old date still shows up.
--  Carry-over 'opening' entries of later tenures are left out: they only repeat the previous closing balance.)
CREATE VIEW unverified_entries AS
SELECT x.id, x.tenure_id, x.kind, x.occurred_on, x.recorded_at, x.recorded_by, x.note, x.tag,
       x.cost_center_id, x.member_id, x.reverses_id,
       EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.reverses_id = x.id) AS is_voided,
       coalesce(sum(l.amount), 0)::int AS net_effect,                              -- effect on total money
       greatest(coalesce(sum(l.amount) FILTER (WHERE l.amount > 0), 0),
                -coalesce(sum(l.amount) FILTER (WHERE l.amount < 0), 0))::int AS size   -- how much moved
  FROM ledger_transactions x
  JOIN ledger_lines l ON l.transaction_id = x.id
 WHERE x.id > coalesce((SELECT lm.through_entry_id FROM last_match lm), 0)
   AND NOT (x.kind = 'opening' AND EXISTS (SELECT 1 FROM tenures t JOIN tenures p ON p.closed_on + 1 = t.opened_on
                                            WHERE t.id = x.tenure_id))
 GROUP BY x.id
 ORDER BY x.id;

CREATE VIEW reconciliation_status AS            -- the "timer"
SELECT lm.id AS last_match_id, lm.checked_on AS last_match_date, lm.through_entry_id AS last_match_through_entry,
       (current_date - lm.checked_on) AS days_since_last_match,
       (SELECT count(*) FROM unverified_entries)::int AS entries_since_last_match,
       (SELECT r.matched FROM reconciliations r ORDER BY r.id DESC LIMIT 1) AS latest_attempt_matched,
       (SELECT r.difference FROM reconciliations r ORDER BY r.id DESC LIMIT 1) AS latest_difference
  FROM (SELECT 1) one LEFT JOIN last_match lm ON true;

-- "the numbers differ by p_diff (counted - screen): which single entry since the last match could explain it?"
-- Finds typed-twice / never-happened, wrong direction, extra zero, missing zero, swapped digits.
-- It cannot find an entry you forgot to record (that one is not in the database); then the notes decide.
-- p_envelope limits the search to one envelope's movements.
CREATE FUNCTION difference_suspects(p_diff integer, p_envelope bigint DEFAULT NULL)
RETURNS TABLE(entry_id bigint, kind entry_kind, occurred_on date, effect integer, note text, why text)
LANGUAGE sql STABLE AS $$
WITH since AS (
  SELECT x.id AS xid, x.kind AS xkind, x.occurred_on AS xdate, x.note AS xnote, sum(l.amount)::int AS e
    FROM ledger_transactions x JOIN ledger_lines l ON l.transaction_id = x.id
   WHERE x.id > coalesce((SELECT lm.through_entry_id FROM last_match lm), 0)
     AND NOT (x.kind = 'opening' AND EXISTS (SELECT 1 FROM tenures t JOIN tenures p ON p.closed_on + 1 = t.opened_on
                                              WHERE t.id = x.tenure_id))
     AND (p_envelope IS NULL OR l.envelope_id = p_envelope)
   GROUP BY x.id
  HAVING sum(l.amount) <> 0
)
SELECT s.xid, s.xkind, s.xdate, s.e, s.xnote,
       'same amount as the difference: typed twice, or recorded but it never happened'::text
  FROM since s WHERE s.e = -p_diff
UNION ALL
SELECT s.xid, s.xkind, s.xdate, s.e, s.xnote,
       'twice the difference: entered in the wrong direction (deposit vs expense)'
  FROM since s WHERE 2 * s.e = -p_diff
UNION ALL
SELECT s.xid, s.xkind, s.xdate, s.e, s.xnote, 'an extra zero typed (ten times too big)'
  FROM since s WHERE s.e % 10 = 0 AND 9 * s.e = -10 * p_diff
UNION ALL
SELECT s.xid, s.xkind, s.xdate, s.e, s.xnote, 'a zero left out (ten times too small)'
  FROM since s WHERE 9 * s.e = p_diff
UNION ALL
SELECT s.xid, s.xkind, s.xdate, s.e, s.xnote, 'two neighbouring digits swapped'
  FROM since s
 WHERE EXISTS (SELECT 1 FROM generate_series(1, length(abs(s.e)::text) - 1) g(p)
                WHERE substr(abs(s.e)::text, g.p, 1) <> substr(abs(s.e)::text, g.p + 1, 1)
                  AND sign(s.e)::int * ((overlay(abs(s.e)::text placing
                        substr(abs(s.e)::text, g.p + 1, 1) || substr(abs(s.e)::text, g.p, 1) from g.p for 2))::int
                        - abs(s.e)) = p_diff)
ORDER BY 1
$$;

CREATE FUNCTION verify_reconciliations() RETURNS TABLE(problem text) LANGUAGE sql STABLE AS $$
  SELECT 'reconciliation #' || r.id || ': the screen total at entry ' || r.through_entry_id || ' was recorded as '
         || r.system_total || ' but now computes to ' || s.total
    FROM reconciliations r
    JOIN LATERAL (SELECT coalesce(sum(l.amount), 0)::int AS total
                    FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
                   WHERE x.tenure_id = r.tenure_id AND x.id <= r.through_entry_id) s ON true
   WHERE s.total <> r.system_total
  UNION ALL
  SELECT 'reconciliation #' || r.id || ': envelope "' || e.name || '" was recorded as ' || re.system_balance
         || ' but now computes to ' || s.bal
    FROM reconciliation_envelopes re
    JOIN reconciliations r ON r.id = re.reconciliation_id
    JOIN envelopes e ON e.id = re.envelope_id
    JOIN LATERAL (SELECT coalesce(sum(l.amount), 0)::int AS bal
                    FROM ledger_lines l JOIN ledger_transactions x ON x.id = l.transaction_id
                   WHERE x.tenure_id = r.tenure_id AND x.id <= r.through_entry_id
                     AND l.envelope_id = re.envelope_id) s ON true
   WHERE s.bal <> re.system_balance
$$;

CREATE FUNCTION verify_all() RETURNS TABLE(problem text) LANGUAGE sql STABLE AS $$   -- empty result = healthy
  SELECT * FROM verify_integrity() UNION ALL SELECT * FROM verify_assets()
  UNION ALL SELECT * FROM verify_reconciliations()
$$;

-- the app connects as this role, never as owner/superuser (change the password!)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labapp') THEN
    CREATE ROLE labapp LOGIN PASSWORD 'change-me';
  END IF;
END $$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO labapp;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO labapp;
GRANT INSERT ON ledger_transactions, ledger_lines, members, membership_periods, fee_rates,
                shutdown_events, member_adjustments, assets, asset_events, allocation_sessions TO labapp;
GRANT INSERT, UPDATE ON envelopes, cost_centers TO labapp;
GRANT UPDATE (note, tag, cost_center_id, occurred_on, source) ON ledger_transactions TO labapp;
GRANT UPDATE (name, batch, note) ON members TO labapp;
GRANT UPDATE (end_date) ON membership_periods TO labapp;
GRANT UPDATE (name, tag, note, mode, ownership) ON assets TO labapp;
GRANT UPDATE (note, cost_center_id, occurred_on) ON asset_events TO labapp;
REVOKE EXECUTE ON FUNCTION close_tenure(date, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION close_tenure(date, text, text) TO labapp;
