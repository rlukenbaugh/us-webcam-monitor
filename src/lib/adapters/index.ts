import { CaltransCctvAdapter } from "@/lib/adapters/caltrans-cctv-adapter";
import { Minnesota511Adapter } from "@/lib/adapters/mndot-511-adapter";
import { OhioOhgoAdapter } from "@/lib/adapters/ohgo-adapter";
import { SourceAdapter } from "@/lib/adapters/types";
import { WashingtonDotAdapter } from "@/lib/adapters/washington-dot-adapter";

export const registeredAdapters: SourceAdapter[] = [
  new Minnesota511Adapter(),
  new WashingtonDotAdapter(),
  new OhioOhgoAdapter(),
  new CaltransCctvAdapter()
];

export function getAdapterByKey(key: string): SourceAdapter | undefined {
  return registeredAdapters.find((adapter) => adapter.key === key);
}
