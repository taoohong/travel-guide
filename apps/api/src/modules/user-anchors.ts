import type { Prisma } from '@prisma/client';
import type { UserAnchorType } from '@travel-guide/constants';

type UserAnchorWriter = Pick<Prisma.TransactionClient, 'userAnchor'>;

export async function recordUserAnchors(writer: UserAnchorWriter, userIds: string[], type: UserAnchorType,
  tripId?: string): Promise<void> {
  if (!userIds.length) return;
  await writer.userAnchor.createMany({
    data: userIds.map((userId) => ({ userId, type, ...(tripId ? { tripId } : {}) })),
    skipDuplicates: true,
  });
}
