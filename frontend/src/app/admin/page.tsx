import { redirect } from "next/navigation";

/** Keep existing Admin bookmarks pointed at the primary administration workflow. */
export default function AdminPage() {
  redirect("/admin/users");
}
