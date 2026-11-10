"use client";
import { useMemo } from 'react';
import { useRouter as useNextRouter } from 'next/navigation';

/** Query routes let newly created local records survive refresh on static hosting. */
export function demoRoute(path: string): string {
  return path.replace(/^\/hawk\/project\/detail\/(\d+)\/batch\/(\d+)(.*)$/, (_, project, batch, rest) => `/hawk/project/batch/?id=${project}&batchId=${batch}${rest.replace(/^\?/, '&')}`)
    .replace(/^\/hawk\/project\/detail\/(\d+)(.*)$/, (_, project, rest) => `/hawk/project/detail/?id=${project}${rest.replace(/^\?/, '&')}`);
}
export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => {
    const navigate = (method: 'push' | 'replace', href: string, options?: Parameters<typeof router.push>[1]) => {
      const route = demoRoute(href);
      const target = new URL(publicAsset(route), window.location.origin);
      // Static hosting has no query-specific RSC response. Next's native history
      // integration updates useSearchParams without fetching or remounting the page.
      if (target.origin === window.location.origin && target.pathname === window.location.pathname) {
        window.history[method === 'push' ? 'pushState' : 'replaceState'](null, '', target.href);
        if (options?.scroll !== false) window.scrollTo(0, 0);
        return;
      }
      router[method](route, options);
    };
    return { ...router, push: (href: string, options?: Parameters<typeof router.push>[1]) => navigate('push', href, options), replace: (href: string, options?: Parameters<typeof router.replace>[1]) => navigate('replace', href, options) };
  }, [router]);
}
export const publicAsset = (path: string) => (process.env.NEXT_PUBLIC_BASE_PATH || '') + path;
