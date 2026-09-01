import { Customer, DeliveryPartner } from "../../models/index.js";

export const updateUser = async (req, reply) => {
  try {
    const { userId } = req.user;
    const allowed = user =>
      user.role === "Customer"
        ? ["name", "email", "phone", "address", "liveLocation", "fcmToken"]
        : ["name", "email", "phone", "liveLocation", "fcmToken"];

    let user = (await Customer.findById(userId)) || (await DeliveryPartner.findById(userId));

    if (!user) {
      return reply.status(404).send({ message: "User not found" });
    }

    let UserModel;
    if (user.role === "Customer") {
      UserModel = Customer;
    } else if (user.role === "DeliveryPartner") {
      UserModel = DeliveryPartner;
    } else {
      return reply.status(400).send({ message: "Invalid user role" });
    }

    const updateData = {};
    for (const [key, val] of Object.entries(req.body || {})) {
      if (allowed(user).includes(key)) {
        if (key === "phone") {
          const digits = String(val).replace(/\D/g, "");
          if (digits.length >= 10) {
            const numericPhone = Number(digits.slice(-10));
            if (!isNaN(numericPhone) && numericPhone > 0) {
              const existing = await UserModel.findOne({ phone: numericPhone, _id: { $ne: userId } });
              if (existing) {
                return reply.status(400).send({ message: "This mobile number is already registered with another account" });
              }
              updateData.phone = numericPhone;
            }
          }
        } else {
          updateData[key] = val;
        }
      }
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return reply.status(404).send({ message: "User not found" });
    }

    return reply.send({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update User Error:", error);
    if (error.code === 11000) {
      return reply.status(400).send({ message: "This mobile number is already registered with another account" });
    }
    return reply.status(500).send({ message: error.message || "Failed to update user", error });
  }
};
