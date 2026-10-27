"use client";
import { useRouter as useNextRouter } from 'next/navigation';

/** Query routes let newly created local records survive refresh on static hosting. */
export function demoRoute(path: string): string {
  return path.replace(/^\/hawk\/project\/detail\/(\d+)\/batch\/(\d+)(.*)$/, (_, project, batch, rest) => `/hawk/project/batch/?id=${project}&batchId=${batch}${rest.replace(/^\?/, '&')}`)
    .replace(/^\/hawk\/project\/detail\/(\d+)(.*)$/, (_, project, rest) => `/hawk/project/detail/?id=${project}${rest.replace(/^\?/, '&')}`);
}
export function useRouter() {
  const router = useNextRouter();
  return { ...router, push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(demoRoute(href), options), replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(demoRoute(href), options) };
}
export const publicAsset = (path: string) => (process.env.NEXT_PUBLIC_BASE_PATH || '') + path;
