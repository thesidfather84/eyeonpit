import { redirect } from "next/navigation";

/** Compatibility route — New Investigation is now a drawer on the main console, not a page. */
export default function NewInvestigationRedirect() {
  redirect("/app?open=new");
}
