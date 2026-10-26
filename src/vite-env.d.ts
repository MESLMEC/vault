/// <reference types="vite/client" />
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const content: React.FC<React.SVGProps<SVGSVGElement>> | string;
  export default content;
}
