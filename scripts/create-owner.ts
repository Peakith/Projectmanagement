/**
 * Veilige procedure om de eerste eigenaar (Lars) te registreren.
 *
 *   npm run owner:create -- --email lars@studiobrutaal.nl --name "Lars"
 *
 * - Draait alleen server-side met SUPABASE_SECRET_KEY (nooit via de app of open registratie).
 * - Weigert als er al een actieve eigenaar is (tenzij --additional, voor een bewuste tweede eigenaar).
 * - Maakt het account aan zonder wachtwoord en toont een eenmalige link om het wachtwoord te kiezen.
 */
import { adminClient, findUserByEmail } from "./lib/script-env";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = arg("email");
const name = arg("name") ?? "";
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Gebruik: npm run owner:create -- --email <e-mail> --name "<naam>" [--additional]');
  process.exit(1);
}
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const admin = adminClient();

const { data: owners, error: ownerErr } = await admin.from("user_roles").select("user_id").eq("role", "owner").eq("active", true);
if (ownerErr) throw ownerErr;
if ((owners?.length ?? 0) > 0 && !process.argv.includes("--additional")) {
  console.error("Er is al een actieve eigenaar. Gebruik --additional alleen als je bewust een tweede eigenaar toevoegt.");
  process.exit(1);
}

let user = await findUserByEmail(admin, email);
let type: "invite" | "recovery" = "recovery";
if (!user) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { full_name: name } } });
  if (error) throw error;
  user = data.user;
  type = "invite";
  await printLink(data.properties.hashed_token, "invite");
} else {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw error;
  await printLink(data.properties.hashed_token, "recovery");
}
if (name) await admin.from("profiles").upsert({ id: user!.id, email, full_name: name });
const { error } = await admin.from("user_roles").upsert({ user_id: user!.id, role: "owner", active: true, deactivated_at: null });
if (error) throw error;
console.log(`\n${email} is eigenaar (${type === "invite" ? "nieuw account" : "bestaand account"}).`);

async function printLink(hashed: string, t: string) {
  console.log("\nEenmalige link om het wachtwoord in te stellen (24 uur geldig). Open deze zelf; deel hem niet:\n");
  console.log(`${appUrl}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=${t}&next=/auth/wachtwoord\n`);
}
