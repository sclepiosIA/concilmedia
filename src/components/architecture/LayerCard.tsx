import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

export function LayerCard({
  index,
  title,
  subtitle,
  accent = "primary",
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  accent?: "primary" | "sky" | "amber" | "emerald" | "violet";
  children: ReactNode;
}) {
  const accents: Record<string, string> = {
    primary: "border-primary/40 bg-primary/5",
    sky: "border-sky-300 bg-sky-50/60",
    amber: "border-amber-300 bg-amber-50/60",
    emerald: "border-emerald-300 bg-emerald-50/60",
    violet: "border-violet-300 bg-violet-50/60",
  };
  return (
    <Card className={`border-2 ${accents[accent]}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs font-mono">
            Couche {index}
          </Badge>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}
