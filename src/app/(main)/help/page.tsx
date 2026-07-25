import { redirect } from "next/navigation";

/** Help content lives in Settings (workflow steps + guided-tips toggle together); this keeps the persistent "?" icon working without a duplicate content page. */
export default function HelpPage() {
  redirect("/settings");
}
