import Order from "../../models/order.js";
import Branch from "../../models/branch.js";
import { Customer, DeliveryPartner } from "../../models/user.js";
import Product from "../../models/products.js";

const distanceInKm = (first, second) => {
    const earthRadiusKm = 6371;
    const toRadians = value => (value * Math.PI) / 180;
    const latitudeDelta = toRadians(second.latitude - first.latitude);
    const longitudeDelta = toRadians(second.longitude - first.longitude);
    const firstLatitude = toRadians(first.latitude);
    const secondLatitude = toRadians(second.latitude);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const calculateOrderPrice = async (items, branch) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Cart is empty");
    }

    const productIds = items.map(item => item.item);
    const products = await Product.find({_id: {$in: productIds}});
    const productMap = new Map(products.map(product => [product._id.toString(), product]));

    const normalizedItems = items.map(item => {
      const product = productMap.get(String(item.item));
      const count = Number(item.count);

      if (!product || !Number.isInteger(count) || count < 1) {
        throw new Error("Cart contains an invalid product or quantity");
      }

      return {
        id: product._id,
        item: product._id,
        count,
        name: product.name,
        image: product.image,
        quantity: product.quantity,
        unitPrice: product.price,
      };
    });

    const itemTotal = normalizedItems.reduce((total, item) => {
      const product = productMap.get(String(item.item));
      return total + product.price * item.count;
    }, 0);
    const deliveryCharge =
      itemTotal >= branch.freeDeliveryThreshold ? 0 : branch.deliveryCharge;
    const handlingCharge = branch.handlingCharge;
    const surgeCharge = branch.surgeEnabled ? branch.surgeCharge : 0;
    const totalPrice = itemTotal + deliveryCharge + handlingCharge + surgeCharge;

    return {
      normalizedItems,
      itemTotal,
      deliveryCharge,
      handlingCharge,
      surgeCharge,
      totalPrice,
    };
};

export const getOrderQuote = async (req, reply) => {
    try {
      const {items, branch} = req.body;
      const branchData = await Branch.findById(branch);
      if (!branchData || !branchData.isActive) {
        return reply.status(400).send({message: "Selected branch is unavailable"});
      }
      const pricing = await calculateOrderPrice(items, branchData);
      return reply.send(pricing);
    } catch (error) {
      return reply.status(400).send({message: error.message});
    }
};

export const createOrder = async(req,reply)=>{
    try {
        const {userId}=req.user;
        const { items, branch} = req.body
        
        const customerData= await Customer.findById(userId)
        const branchData = await Branch.findById(branch)

        if(!customerData){
           return reply.status(404).send({ message: "Customer not found" });
        }

        if(!branchData){
           return reply.status(400).send({ message: "Selected branch not found" });
        }

        if(!branchData.isActive){
           return reply.status(400).send({ message: "Selected branch is currently unavailable" });
        }

        if(
          customerData.liveLocation?.latitude == null ||
          customerData.liveLocation?.longitude == null
        ){
           return reply.status(400).send({ message: "Please set your delivery location before placing an order" });
        }

        const deliveryDistanceKm = distanceInKm(
          branchData.location,
          customerData.liveLocation,
        );

        if(deliveryDistanceKm > branchData.deliveryRadiusKm){
           return reply.status(400).send({
             message: `Delivery is unavailable in your area. This branch serves up to ${branchData.deliveryRadiusKm} km.`,
           });
        }

        const pricing = await calculateOrderPrice(items, branchData);

        const newOrder = new Order({
            customer:userId,
            items: pricing.normalizedItems,
            branch,
            itemTotal: pricing.itemTotal,
            deliveryCharge: pricing.deliveryCharge,
            handlingCharge: pricing.handlingCharge,
            surgeCharge: pricing.surgeCharge,
            totalPrice: pricing.totalPrice,
            deliveryLocation:{
                latitude: customerData.liveLocation.latitude,
                longitude: customerData.liveLocation.longitude,
                address: customerData.address || "No address available",
            },
            pickupLocation: {
                latitude: branchData.location.latitude,
                longitude: branchData.location.longitude,
                address: branchData.address || "No address available",
              },
        });

        let savedOrder = await newOrder.save();

        savedOrder = await savedOrder.populate([
            { path: "items.item" },
        ]);

        return reply.status(201).send(savedOrder);
 
    } catch (error) {
        console.log(error);
        return reply.status(500).send({ message: "Failed to create order", error });
    }
}

export const confirmOrder = async(req,reply)=>{
    try {
        const { orderId } = req.params;
        const { userId } = req.user;
        const { deliveryPersonLocation } = req.body;  
        
        const deliveryPerson = await DeliveryPartner.findById(userId);
        if (!deliveryPerson || req.user.role !== "DeliveryPartner") {
            return reply.status(404).send({ message: "Delivery Person not found" });
        }
        const order = await Order.findOneAndUpdate(
          {_id: orderId, branch: deliveryPerson.branch, status: "available", deliveryPartner: null},
          {$set: {status: "confirmed", deliveryPartner: userId, deliveryPersonLocation: {latitude: deliveryPersonLocation?.latitude, longitude: deliveryPersonLocation?.longitude, address: deliveryPersonLocation?.address || ""}}},
          {new: true, runValidators: true},
        );
        if (!order) return reply.status(404).send({ message: "Order not found" });

        req.server.io.to(orderId).emit('orderConfirmed',order);
        return reply.send(order)

    } catch (error) {
      console.log(error)
        return reply
        .status(500)
        .send({ message: "Failed to confirm order", error });
    }
} 

export const updateOrderStatus=async(req,reply)=>{
    try {
        const { orderId } = req.params;
        const { status, deliveryPersonLocation } = req.body;
        const { userId } = req.user;

        const deliveryPerson = await DeliveryPartner.findById(userId);
        if (!deliveryPerson || req.user.role !== "DeliveryPartner") {
          return reply.status(404).send({ message: "Delivery Person not found" });
        }
    
        const order = await Order.findById(orderId);
        if (!order) return reply.status(404).send({ message: "Order not found" });

        const transitions = {confirmed: ["arriving"], arriving: ["delivered"]};
        if (!transitions[order.status]?.includes(status)) {
            return reply.status(400).send({ message: "Order cannot be updated" });
          }
        
        if (!order.deliveryPartner || order.deliveryPartner.toString() !== userId) {
            return reply.status(403).send({ message: "Unauthorized" });
        }

        order.status = status;
        order.deliveryPersonLocation = deliveryPersonLocation;
        await order.save();

        req.server.io.to(orderId).emit("liveTrackingUpdates", order);

        return reply.send(order);
        
    } catch (error) {
        return reply
        .status(500)
        .send({ message: "Failed to update order status", error });
    }
}

export const getOrders = async (req, reply) => {
    try {
      const { status, customerId, deliveryPartnerId, branchId } = req.query;
      let query = {};

      if (req.user.role === "Customer") {
        query.customer = req.user.userId;
      }
  
      if (status) {
        query.status = status;
      }
      if (customerId && req.user.role !== "Customer") {
        query.customer = customerId;
      }
      if (req.user.role === "DeliveryPartner") {
        const partner = await DeliveryPartner.findById(req.user.userId).lean();
        if (!partner?.branch) return reply.code(403).send({message: "Delivery branch unavailable"});
        query.branch = partner.branch;
        if (status !== "available") query.deliveryPartner = req.user.userId;
      }
  
      const orders = await Order.find(query).sort({createdAt: -1}).populate(
        "customer branch items.item deliveryPartner"
      );
  
      return reply.send(orders);
    } catch (error) {
      return reply
        .status(500)
        .send({ message: "Failed to retrieve orders", error });
    }
  };

export const getOrderById = async (req, reply) => {
    try {
      const { orderId } = req.params;
  
      const order = await Order.findById(orderId).populate(
        "customer branch items.item deliveryPartner"
      );
  
      if (!order) {
        return reply.status(404).send({ message: "Order not found" });
      }
      const allowed = req.user.role === "Customer"
        ? String(order.customer?._id || order.customer) === req.user.userId
        : req.user.role === "DeliveryPartner" && (String(order.deliveryPartner?._id || order.deliveryPartner) === req.user.userId || (order.status === "available" && String(order.branch?._id || order.branch) === String((await DeliveryPartner.findById(req.user.userId).lean())?.branch)));
      if (!allowed) return reply.code(403).send({message: "Forbidden"});
  
      return reply.send(order);
    } catch (error) {
      return reply
        .status(500)
        .send({ message: "Failed to retrieve order", error });
    }
  };
  
