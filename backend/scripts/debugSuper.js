import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

await mongoose.connect(process.env.MONGO_URI);
console.log('DB name:', mongoose.connection.name);
const cols = (await mongoose.connection.db.listCollections().toArray()).map(c => c.name);
console.log('Collections:', cols.join(', '));

const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
const pw = process.env.SUPER_ADMIN_PASSWORD || '';
console.log('Env email set:', !!email, '| env password length:', pw.length);

for (const name of cols.filter(n => /super/i.test(n))) {
  const docs = await mongoose.connection.db.collection(name).find({}).toArray();
  console.log(`\n${name}: ${docs.length} document(s)`);
  for (const d of docs) {
    console.log({
      email: d.email,
      emailMatchesEnv: d.email === email,
      hashPrefix: String(d.password).slice(0, 4),
      hashLength: String(d.password).length,
      passwordMatchesEnv: d.password ? await bcrypt.compare(pw, d.password) : null,
    });
  }
}
await mongoose.disconnect();