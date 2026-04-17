import { PrismaClient, SubmissionStatus } from "@prisma/client";
import { bulkPromoteSubmissionsToCameras } from "../src/lib/admin/submission-promotion";

const prisma = new PrismaClient();

async function main() {
  const result = await bulkPromoteSubmissionsToCameras(prisma, {
    sourceKey: "seed-dataset-import",
    status: SubmissionStatus.PENDING,
    limit: 20000
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
