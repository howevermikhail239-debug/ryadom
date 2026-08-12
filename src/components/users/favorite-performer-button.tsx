"use client";

import { useState } from "react";
import { Heart, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function FavoritePerformerButton({ performerId, initialFavorite }: { performerId: string; initialFavorite: boolean }) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/favorites/${performerId}`, { method: favorite ? "DELETE" : "POST" });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось изменить избранное.");
      setFavorite((value) => !value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось изменить избранное.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="mt-4"><Button type="button" variant={favorite ? "default" : "outline"} onClick={() => void toggle()} disabled={loading} className="w-full"><span className="relative">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <Heart className={`size-4 ${favorite ? "fill-current" : ""}`} />}</span>{favorite ? "В избранном" : "Добавить в избранное"}</Button>{error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}</div>;
}
