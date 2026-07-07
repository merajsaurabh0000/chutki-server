import mongoose from "mongoose";

export const connectDB = async(uri)=>{
    try {
        await mongoose.connect(uri, {serverSelectionTimeoutMS: 10000})
    } catch (error) {
        throw error;
    }
}
