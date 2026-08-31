import {
    fetchUser,
    loginCustomer,
    sendOtp,
    googleLogin,
    loginDeliveryPartner,
    refreshToken,
    logout,
  } from "../controllers/auth/auth.js";
import { updateUser } from "../controllers/tracking/user.js";
import {
    createAddress,
    deleteAddress,
    listAddresses,
    selectAddress,
    updateAddress,
} from "../controllers/address/address.js";
import { verifyToken } from "../middleware/auth.js";

export const authRoutes = async (fastify, options) => {
    const authLimit = {config: {rateLimit: {max: 5, timeWindow: "10 minutes"}}};
    fastify.post("/customer/send-otp", authLimit, sendOtp);
    fastify.post("/customer/login", authLimit, loginCustomer);
    fastify.post("/customer/google-login", googleLogin);
    fastify.post("/delivery/login", authLimit, loginDeliveryPartner);
    fastify.post("/refresh-token", refreshToken);
    fastify.post("/logout", logout);
    fastify.get("/user", { preHandler: [verifyToken] }, fetchUser);
    fastify.patch("/user", { preHandler: [verifyToken] }, updateUser);
    fastify.get("/customer/addresses", { preHandler: [verifyToken] }, listAddresses);
    fastify.post("/customer/addresses", { preHandler: [verifyToken] }, createAddress);
    fastify.put("/customer/addresses/:addressId", { preHandler: [verifyToken] }, updateAddress);
    fastify.post("/customer/addresses/:addressId/select", { preHandler: [verifyToken] }, selectAddress);
    fastify.delete("/customer/addresses/:addressId", { preHandler: [verifyToken] }, deleteAddress);
};
