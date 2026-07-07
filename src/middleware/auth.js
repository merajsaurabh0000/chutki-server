import jwt from "jsonwebtoken";
import { Customer, DeliveryPartner } from "../models/user.js";

export const verifyToken = async(req,reply)=>{
    try {
        const authHeader = req.headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return reply.status(401).send({ message: "Access token required" });
          }
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const Model = decoded.role === "Customer" ? Customer : decoded.role === "DeliveryPartner" ? DeliveryPartner : null;
        const user = Model && await Model.findById(decoded.userId).select("isActivated role");
        if (!user?.isActivated) return reply.status(401).send({message: "Account unavailable"});
        req.user = decoded;
        return true;
    } catch (error) {
        return reply.status(403).send({ message: "Invalid or expired token" });
    }
}
