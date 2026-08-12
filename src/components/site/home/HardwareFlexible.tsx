import { Laptop, Smartphone, Tablet, Headphones } from "lucide-react";

const DEVICES = [
  { icon: Laptop, label: "Surveillance Workstations" },
  { icon: Smartphone, label: "Smartphones" },
  { icon: Tablet, label: "Tablets" },
  { icon: Headphones, label: "Headsets" },
];

export function HardwareFlexible() {
  return (
    <section className="border-b border-border/60 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Hardware Flexible</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          No specialized blackjack tables and no proprietary hardware required. EyeOnPit runs on the devices already
          in the room.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {DEVICES.map((device) => (
            <div key={device.label} className="flex flex-col items-center gap-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface">
                <device.icon className="h-5 w-5 text-muted-foreground" aria-hidden />
              </span>
              <span className="text-xs font-medium text-muted-foreground">{device.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
