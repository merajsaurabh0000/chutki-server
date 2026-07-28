import mongoose from "mongoose";

const categoryScehma = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, default: "" },
});

const Category = mongoose.model("Category", categoryScehma);

export default Category;
