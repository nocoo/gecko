import type { ReactNode } from "react";

export { Breadcrumbs } from "@nocoo/basalt/components/breadcrumbs";

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}
