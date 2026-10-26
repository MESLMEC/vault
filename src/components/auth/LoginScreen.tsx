import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Info } from 'lucide-react';
import { Login, LoginFormData } from '../ui/Login';
import { api } from '../../services/api';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      await api.auth.login({
        username: data.email.trim(),
        password: data.password,
      });

      if (!data.rememberMe) {
        // If not remembering, token is still in memory/localStorage for session
      }

      onLoginSuccess();
    } catch (err: any) {
      setError(
        err?.reason ||
        err?.message ||
        'Authentication failed. Please verify username and password.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = (provider: 'github' | 'google' | 'apple') => {
    setNotice(
      `${provider.charAt(0).toUpperCase() + provider.slice(1)} SSO is enabled for authorized MESL workspace accounts. Standard credentials active below.`
    );
    setTimeout(() => setNotice(null), 4000);
  };

  const handleForgotPassword = () => {
    setNotice(
      'Password recovery is managed by the MESL Executive Board.'
    );
    setTimeout(() => setNotice(null), 5000);
  };

  const handleSignUpClick = () => {
    setNotice(
      'Self-registration is currently restricted to appointed Lab Treasurers.'
    );
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="min-h-screen w-full bg-[#050505] text-[#FAFAFA] flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Background radial glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* Lab Branding Watermark */}
      <div className="mb-6 flex items-center gap-2.5 z-10">
        <div className="h-8 w-8 rounded-lg bg-[#141414] border border-[#1F1F1F] flex items-center justify-center text-xs font-bold tracking-wider text-[#FAFAFA]">
          M
        </div>
        <span className="text-sm font-semibold tracking-tight text-[#FAFAFA]">
          MESL Vault
        </span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B6B6B] px-1.5 py-0.5 rounded bg-[#141414] border border-[#1F1F1F]">
          Treasury
        </span>
      </div>

      {/* Floating Notice Banner (for showcase interactions) */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 max-w-md w-full p-3 rounded-xl bg-[#141414] border border-[#2E2E2E] text-xs text-[#EAEAEA] flex items-center gap-2.5 shadow-xl z-20"
          >
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="flex-1">{notice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The EasyUI Login Card */}
      <div className="w-full max-w-md relative z-10">
        <Login
          title="Sign in to Vault"
          description="Enter treasurer credentials to access the finance and ledger console"
          logo={
            <div className="w-11 h-11 rounded-xl bg-[#141414] border border-[#1F1F1F] flex items-center justify-center text-[#FAFAFA] shadow-xs">
              <Sparkles className="w-5 h-5 text-[#FAFAFA]" />
            </div>
          }
          error={error}
          isLoading={isLoading}
          onSubmit={handleLogin}
          onSocialLogin={handleSocialLogin}
          onForgotPassword={handleForgotPassword}
          onSignUpClick={handleSignUpClick}
          signUpText="Don't have an account? Sign up"
          showSocialLogins={true}
        />
      </div>
    </div>
  );
};

export default LoginScreen;
