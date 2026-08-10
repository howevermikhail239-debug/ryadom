"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm("Удалить задачу? Она пропадёт из активного списка.")) return;
    setLoading(true);
    setError("");
    const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setLoading(false);
      setError(result.error ?? "Не удалось удалить задачу.");
      return;
    }
    router.replace("/tasks");
    router.refresh();
  }

  return (
    <div>
      <Button type="button" variant="destructive" className="w-full" onClick={remove} disabled={loading}>
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Удалить задачу
      </Button>
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
