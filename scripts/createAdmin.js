import "dotenv/config";
import {connectDB} from "../src/config/connect.js";
import {Admin} from "../src/models/user.js";

const email = "meditech@gmail.com";
const password = "admin@1234";

async function createOrUpdateAdmin() {
  try {
    await connectDB(process.env.MONGO_URI);
    let admin = await Admin.findOne({ email: email.toLowerCase() });
    
    if (!admin) {
      console.log("Admin not found. Creating a new admin account...");
      admin = new Admin({ email: email.toLowerCase(), role: "Admin", isActivated: true });
    } else {
      console.log("Admin found. Updating password...");
    }
    
    admin.password = password;
    admin.isActivated = true;
    await admin.save();
    
    console.log("Admin account successfully created/updated!");
    process.exit(0);
  } catch (error) {
    console.error("Error creating admin:", error);
    process.exit(1);
  }
}

createOrUpdateAdmin();
