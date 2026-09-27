declare const defineAppConfig: <T extends Record<string, unknown>>(config: T) => T;
declare module '*.png' { const path: string; export default path; }
declare module '*.jpg' { const path: string; export default path; }
declare module '*.svg' { const path: string; export default path; }
declare namespace NodeJS { interface ProcessEnv { TARO_APP_API_BASE_URL?: string; TARO_APP_DEV_AUTH?: string } }
