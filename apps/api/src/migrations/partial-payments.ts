import { connectToDatabase } from "../database/connection.js";
import { SupplierPayment } from "../models/supplier-payment.model.js";
import mongoose from "mongoose";

async function migrate(): Promise<void> {
 await connectToDatabase();
 try {
  // Older deployments have a unique organizationId+invoiceId index that blocks
  // multiple allocations. Remove only that obsolete index before creating the
  // current schema indexes; the data itself is retained.
  try {
   await SupplierPayment.collection.dropIndex("organizationId_1_invoiceId_1");
   console.info("Dropped legacy one-payment-per-invoice index");
  } catch (error) {
   const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
   if (code !== 27 && code !== 26) throw error;
   console.info("Legacy payment index was not present");
  }
  await SupplierPayment.createIndexes();
  console.info("Partial-payment indexes are ready");
 } finally {
  await mongoose.disconnect();
 }
}

migrate().catch(error => {
 console.error("Partial-payment migration failed:", error);
 process.exitCode = 1;
});
