import "dotenv/config.js";
import mongoose from "mongoose";
import Branch from "./src/models/branch.js";

async function checkBranch() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const branches = await Branch.find();
    console.log("Current Branches in DB:", JSON.stringify(branches, null, 2));
  } catch (error) {
    console.error("Error checking Branch:", error);
  } finally {
    mongoose.connection.close();
  }
}

checkBranch();
