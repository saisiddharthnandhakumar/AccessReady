import { AlertTriangle, Check, Info, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function SeverityBadge({ impact }: { impact: string | null }) {
  if (impact === "pass") {
    return (
      <Badge variant="success" className="gap-1">
        <Check className="h-3 w-3" aria-hidden="true" />
        pass
      </Badge>
    );
  }

  if (impact === "critical" || impact === "serious") {
    return (
      <Badge variant="danger" className="gap-1">
        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
        {impact}
      </Badge>
    );
  }

  if (impact === "moderate") {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        moderate
      </Badge>
    );
  }

  return (
    <Badge className="gap-1">
      <Info className="h-3 w-3" aria-hidden="true" />
      {impact ?? "unknown"}
    </Badge>
  );
}
