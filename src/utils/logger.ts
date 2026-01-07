export const logger = {
  log: (message: string, data?: any) => {
    console.log(`[APP LOG] ${new Date().toISOString()} - ${message}`, data || '');
  },
  
  error: (message: string, error?: any) => {
    console.error(`[APP ERROR] ${new Date().toISOString()} - ${message}`, error || '');
  },
  
  warn: (message: string, data?: any) => {
    console.warn(`[APP WARN] ${new Date().toISOString()} - ${message}`, data || '');
  }
};