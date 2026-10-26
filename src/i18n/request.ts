import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const messages = (await import('../../messages/pt.json')).default;

  return {
    locale: 'pt',
    messages,
  };
});
