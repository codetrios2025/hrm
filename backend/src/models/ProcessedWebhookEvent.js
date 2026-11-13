import mongoose from "mongoose";

const processedWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  processedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
});

processedWebhookEventSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

export default mongoose.model(
  "ProcessedWebhookEvent",
  processedWebhookEventSchema,
);
