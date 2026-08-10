import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, UserRole } from "../src/generated/prisma/client";

config({ path: [".env.production", ".env.local", ".env"], quiet: true });

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Для seed требуется DIRECT_DATABASE_URL или DATABASE_URL.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const categories = [
  { slug: "delivery", name: "Доставка", icon: "📦", sortOrder: 10 },
  { slug: "moving", name: "Разгрузка", icon: "💪", sortOrder: 20 },
  { slug: "home-repair", name: "Ремонт", icon: "🔧", sortOrder: 30 },
  { slug: "pets", name: "Питомцы", icon: "🐕", sortOrder: 40 },
  { slug: "shift", name: "Подмена на смене", icon: "☕", sortOrder: 50 },
  { slug: "cleaning", name: "Уборка", icon: "🧹", sortOrder: 60 },
  { slug: "tech-help", name: "Техника", icon: "💻", sortOrder: 70 },
  { slug: "other", name: "Другое", icon: "✨", sortOrder: 100 },
] as const;

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, icon: category.icon, sortOrder: category.sortOrder, isActive: true },
    });
  }

  const testUsers = [
    {
      phone: "+79990000001",
      displayName: "Тестовый заказчик",
      roles: ["CUSTOMER"] as const,
    },
    {
      phone: "+79990000002",
      displayName: "Тестовый исполнитель",
      roles: ["PERFORMER"] as const,
    },
    {
      phone: "+79990000003",
      displayName: "Тестовый администратор",
      roles: ["CUSTOMER", "PERFORMER", "ADMIN"] as const,
    },
  ];

  for (const user of testUsers) {
    await prisma.user.upsert({
      where: { phone: user.phone },
      create: {
        phone: user.phone,
        phoneVerifiedAt: new Date(),
        displayName: user.displayName,
        roles: [...user.roles],
        status: "ACTIVE",
        isTest: true,
      },
      update: {
        displayName: user.displayName,
        roles: [...user.roles],
        status: "ACTIVE",
        isTest: true,
        deletedAt: null,
      },
    });
  }

  const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
  if (adminTelegramId) {
    const existingAdmin = await prisma.user.findUnique({
      where: { telegramId: BigInt(adminTelegramId) },
      select: { roles: true },
    });
    if (existingAdmin) {
      await prisma.user.update({
        where: { telegramId: BigInt(adminTelegramId) },
        data: { roles: [...new Set([...existingAdmin.roles, UserRole.CUSTOMER, UserRole.PERFORMER, UserRole.ADMIN])] },
      });
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
