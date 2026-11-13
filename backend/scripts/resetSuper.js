import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
const pw = process.env.SUPER_ADMIN_PASSWORD || '';
if (!email || pw.length < 8) throw new Error('Set SUPER_ADMIN_EMAIL and a password of 8+ characters');

await mongoose.connect(process.env.MONGO_URI);
const col = mongoose.connection.db.collection('superadmins'); // use the collection name printed in Step 1
const hash = await bcrypt.hash(pw, 12);
const r = await col.updateOne(
  { email },
  { $set: { email, password: hash, isActive: true, updatedAt: new Date() },
    $setOnInsert: { name: 'Super Admin', createdAt: new Date() } },
  { upsert: true }
);
console.log('matched:', r.matchedCount, 'upserted:', r.upsertedCount);
await mongoose.disconnect();