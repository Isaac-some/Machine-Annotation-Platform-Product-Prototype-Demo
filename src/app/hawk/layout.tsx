import { HawkShellClient } from "./hawk-shell-client";

export default function HawkLayout({ children }: { children: React.ReactNode }) {
  return <HawkShellClient>{children}</HawkShellClient>;
}
