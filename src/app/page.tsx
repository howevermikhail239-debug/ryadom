import { FeedPage } from "@/components/feed/feed-page";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, categories] = await Promise.all([
    getCurrentUser(),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, icon: true },
    }),
  ]);

  return (
    <FeedPage
      apiKey={
        process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.includes("placeholder")
          ? ""
          : (process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "")
      }
      categories={categories}
      user={user ? { displayName: user.displayName, avatarUrl: user.avatarUrl, isAdmin: user.roles.includes("ADMIN"), telegramVerified: Boolean(user.telegramVerifiedAt) } : null}
    />
  );
}
