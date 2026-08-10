import { redirect } from "next/navigation";
import { MapPin, ShieldCheck, Zap } from "lucide-react";

import { TelegramLogin } from "@/components/auth/telegram-login";
import { PhoneLogin } from "@/components/auth/phone-login";
import { Card, CardContent } from "@/components/ui/card";
import { serverEnv } from "@/config/server-env";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);
  const nextPath = query.next?.startsWith("/") && !query.next.startsWith("//") ? query.next : "/";
  if (user) redirect(nextPath);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  const telegramConfigured =
    Boolean(botUsername) &&
    !botUsername.startsWith("local_") &&
    !serverEnv.TELEGRAM_BOT_TOKEN.includes("placeholder");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-5 py-8">
      <div>
        <div className="mb-10 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-emerald-950 text-white shadow-lg shadow-emerald-950/15">
            <MapPin className="size-6" />
          </div>
          <div>
            <p className="text-xl font-black tracking-tight">Рядом</p>
            <p className="text-xs text-stone-500">дела находятся ближе</p>
          </div>
        </div>

        <h1 className="max-w-sm text-4xl font-black leading-[1.05] tracking-[-0.04em] text-stone-950">
          Помощь и подработка в нескольких минутах от вас
        </h1>
        <p className="mt-4 text-base leading-7 text-stone-600">
          Срочные небольшие дела без долгих переписок. Увидели — взяли — сделали.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-stone-700">
          <div className="rounded-2xl bg-white/70 p-3"><Zap className="mx-auto mb-2 size-5 text-orange-500" />1 тап</div>
          <div className="rounded-2xl bg-white/70 p-3"><MapPin className="mx-auto mb-2 size-5 text-emerald-700" />рядом</div>
          <div className="rounded-2xl bg-white/70 p-3"><ShieldCheck className="mx-auto mb-2 size-5 text-blue-600" />безопасно</div>
        </div>
      </div>

      <Card className="mt-10 border-0 shadow-xl shadow-stone-900/10">
        <CardContent>
          <h2 className="text-center text-lg font-bold">Войти бесплатно</h2>
          <p className="mb-5 mt-1 text-center text-sm text-stone-500">Telegram подтвердит профиль за несколько секунд</p>
          {query.error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
          {telegramConfigured ? (
            <TelegramLogin botUsername={botUsername} nextPath={nextPath} />
          ) : (
            <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
              Telegram пока не настроен. Укажите настоящий bot username и token в .env.production, затем пересоберите приложение.
            </p>
          )}
          <div className="my-5 flex items-center gap-3 text-xs font-semibold text-stone-400"><span className="h-px flex-1 bg-stone-200" />или по телефону<span className="h-px flex-1 bg-stone-200" /></div>
          <PhoneLogin nextPath={nextPath} enabled={serverEnv.SMS_PROVIDER !== "disabled"} />
        </CardContent>
      </Card>
      <p className="mt-5 text-center text-xs leading-5 text-stone-500">
        Продолжая, вы соглашаетесь с условиями сервиса и обработкой персональных данных.
      </p>
    </main>
  );
}
