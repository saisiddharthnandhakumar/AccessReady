import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ScanStatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle className="h-3 w-3" aria-hidden="true" />
        Completed
      </Badge>
    );
  }

  if (status === "failed") {
    return (
      <Badge variant="danger" className="gap-1">
        <XCircle className="h-3 w-3" aria-hidden="true" />
        Failed
      </Badge>
    );
  }

  return (
    <Badge variant="warning" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      Running
    </Badge>
  );
}
