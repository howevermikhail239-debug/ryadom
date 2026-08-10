import { redirect } from "next/navigation";

export default function InProgressTasksPage() {
  redirect("/my-tasks?role=performer");
}
