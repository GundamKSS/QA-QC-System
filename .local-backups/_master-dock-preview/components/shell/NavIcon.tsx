import type { SVGProps } from "react";
import {
  AlertIcon,
  DashboardIcon,
  HistoryIcon,
  HomeIcon,
  JobsIcon,
  MasterDataIcon,
  MoreIcon,
  PlansIcon,
  ReportIcon,
  ScanIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/dom/Icons";
import type { NavIcon as NavIconName } from "./nav";

const ICONS = {
  home: HomeIcon,
  history: HistoryIcon,
  dashboard: DashboardIcon,
  plans: PlansIcon,
  jobs: JobsIcon,
  scan: ScanIcon,
  alerts: AlertIcon,
  more: MoreIcon,
  master: MasterDataIcon,
  reports: ReportIcon,
  settings: SettingsIcon,
  users: UsersIcon,
} satisfies Record<NavIconName, unknown>;

export function NavIcon({ name, ...props }: { name: NavIconName } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" {...props} />;
}
