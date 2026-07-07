import "dotenv/config";
import {connectDB} from "../src/config/connect.js";
import {Admin, DeliveryPartner} from "../src/models/user.js";

if (process.env.ALLOW_PRIVILEGED_RESET !== "true") throw new Error("Set ALLOW_PRIVILEGED_RESET=true for this one-time operation");
await connectDB(process.env.MONGO_URI);
for (const [Model, email, password] of [
  [Admin, process.env.RESET_ADMIN_EMAIL, process.env.RESET_ADMIN_PASSWORD],
  [DeliveryPartner, process.env.RESET_DELIVERY_EMAIL, process.env.RESET_DELIVERY_PASSWORD],
]) {
  if (!email || !password || password.length < 12) continue;
  const user = await Model.findOne({email: email.toLowerCase()}).select("+password");
  if (!user) throw new Error(`Account not found: ${email}`);
  user.password = password; user.isActivated = true; await user.save();
}
console.log("Privileged credentials reset. Remove reset variables immediately.");
process.exit(0);
