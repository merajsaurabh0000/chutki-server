import Order from "../../models/order.js";
import Branch from "../../models/branch.js";
import { Customer, DeliveryPartner } from "../../models/user.js";
import Product from "../../models/products.js";
import { sendPushNotification } from "../../services/notification.js";

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

const normalizeLocation = location => {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
    return {
      latitude,
      longitude,
      address: location?.address || "",
    };
};

const sendWhatsAppAlert = async (phone, text) => {
  try {
    const formattedPhone = String(phone || "").replace(/\D/g, "");
    if (!formattedPhone || formattedPhone.length < 10) return;
    
    const response = await fetch("https://api.zavu.dev/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.ZAVU_AUTH_TOKEN || "zv_live_9815951622c6611ba8236a4506d75c1000741bb208f7f160"}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: `+91${formattedPhone.slice(-10)}`,
        channel: "whatsapp",
        text: text
      })
    });
    const data = await response.json();
    console.log(`Zavu WhatsApp Alert response:`, data);
  } catch (error) {
    console.error(`Failed to send Zavu WhatsApp Alert: ${error.message}`);
  }
};

const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

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

    const itemTotal = roundMoney(normalizedItems.reduce((total, item) => {
      const product = productMap.get(String(item.item));
      return total + product.price * item.count;
    }, 0));
    const deliveryCharge =
      roundMoney(itemTotal >= branch.freeDeliveryThreshold ? 0 : branch.deliveryCharge);
    const handlingCharge = roundMoney(branch.handlingCharge);
    const surgeCharge = roundMoney(branch.surgeEnabled ? branch.surgeCharge : 0);
    const totalPrice = roundMoney(itemTotal + deliveryCharge + handlingCharge + surgeCharge);

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

        const isDemo = customerData.phone === 9999999999;
        if(deliveryDistanceKm > branchData.deliveryRadiusKm && !isDemo){
           return reply.status(400).send({
             message: `Delivery is unavailable in your area. This branch serves up to ${branchData.deliveryRadiusKm} km.`,
           });
        }

        const pricing = await calculateOrderPrice(items, branchData);

        const newOrder = new Order({
            customer:userId,
            vendor: branchData.vendor,
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

        if (customerData.phone) {
          sendWhatsAppAlert(
            customerData.phone,
            `Order Placed! Hello ${customerData.name || "Customer"}, your order #${savedOrder.orderId} of ₹${savedOrder.totalPrice} has been placed successfully. It will be delivered to: ${savedOrder.deliveryLocation?.address || "your address"}.`
          );
        }

        sendPushNotification(
          customerData,
          "Order Placed Successfully!",
          `Your order #${savedOrder.orderId} of ₹${savedOrder.totalPrice} has been placed.`
        );

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

        const existingOrder = await Order.findById(orderId);
        if (!existingOrder) {
          return reply.status(404).send({ message: "Order not found" });
        }
        if (String(existingOrder.branch) !== String(deliveryPerson.branch)) {
          return reply.status(403).send({ message: "This order belongs to another branch" });
        }
        if (
          existingOrder.deliveryPartner &&
          String(existingOrder.deliveryPartner) === String(userId)
        ) {
          await existingOrder.populate("customer branch items.item deliveryPartner");
          return reply.send(existingOrder);
        }
        if (existingOrder.deliveryPartner) {
          return reply.status(409).send({ message: "Order already assigned to another delivery partner" });
        }
        if (existingOrder.status !== "available") {
          return reply.status(409).send({ message: `Order is ${existingOrder.status}, not available` });
        }

        const order = await Order.findOneAndUpdate(
          {_id: orderId, branch: deliveryPerson.branch, status: "available", deliveryPartner: null},
          {$set: {status: "confirmed", deliveryPartner: userId, ...(normalizeLocation(deliveryPersonLocation) ? {deliveryPersonLocation: normalizeLocation(deliveryPersonLocation)} : {})}},
          {new: true, runValidators: true},
        );
        if (!order) return reply.status(409).send({ message: "Order could not be assigned. Please refresh and try again." });

        await order.populate("customer branch items.item deliveryPartner");

        req.server.io.to(orderId).emit('orderConfirmed',order);

        if (order.customer?.phone) {
          sendWhatsAppAlert(
            order.customer.phone,
            `Order Confirmed! Hello ${order.customer.name || "Customer"}, your order #${order.orderId} has been accepted by our delivery partner ${order.deliveryPartner?.name || "Delivery Agent"} and is on the way to the store. Delivery address: ${order.deliveryLocation?.address || "your address"}.`
          );
        }

        sendPushNotification(
          order.customer,
          "Order Confirmed!",
          `Your order #${order.orderId} has been accepted by ${order.deliveryPartner?.name || "Delivery Agent"}.`
        );

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
        const { status, deliveryPersonLocation, otp } = req.body;
        const { userId } = req.user;

        const deliveryPerson = await DeliveryPartner.findById(userId);
        if (!deliveryPerson || req.user.role !== "DeliveryPartner") {
          return reply.status(404).send({ message: "Delivery Person not found" });
        }
    
        const order = await Order.findById(orderId);
        if (!order) return reply.status(404).send({ message: "Order not found" });

        const transitions = {
          confirmed: ["preparing"],
          preparing: ["arriving"],
          arriving: ["delivered"]
        };
        if (!transitions[order.status]?.includes(status)) {
            return reply.status(400).send({ message: "Order cannot be updated" });
          }
        
        if (!order.deliveryPartner || order.deliveryPartner.toString() !== userId) {
            return reply.status(403).send({ message: "Unauthorized" });
        }

        if (status === "delivered") {
          if (!otp || String(otp) !== String(order.deliveryOtp)) {
            return reply.code(400).send({ message: "Invalid Delivery OTP" });
          }
        }

        if (status === "arriving") {
          order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
        }

        order.status = status;
        const safeDeliveryPersonLocation = normalizeLocation(deliveryPersonLocation);
        if (safeDeliveryPersonLocation) {
          order.deliveryPersonLocation = safeDeliveryPersonLocation;
        }
        await order.save();

        await order.populate("customer deliveryPartner");

        req.server.io.to(orderId).emit("liveTrackingUpdates", order);

        if (order.customer?.phone) {
          let statusMessage = "";
          if (status === "preparing") {
            statusMessage = `Order is being packed! Hello ${order.customer.name || "Customer"}, your order #${order.orderId} is being prepared and packed by the store. We will notify you once it's out for delivery!`;
          } else if (status === "arriving") {
            statusMessage = `Order is on the way! Hello ${order.customer.name || "Customer"}, our delivery partner ${order.deliveryPartner?.name || "Delivery Agent"} is arriving at your address: ${order.deliveryLocation?.address || "your address"} with your order #${order.orderId}. Please share OTP ${order.deliveryOtp} to complete delivery.`;
          } else if (status === "delivered") {
            statusMessage = `Order Delivered! Hello ${order.customer.name || "Customer"}, your order #${order.orderId} has been delivered successfully to: ${order.deliveryLocation?.address || "your address"}. Thank you for shopping with MediTech!`;
          }
          if (statusMessage) {
            sendWhatsAppAlert(order.customer.phone, statusMessage);
          }
        }

        let pushTitle = "";
        let pushBody = "";
        if (status === "preparing") {
          pushTitle = "Order is being packed!";
          pushBody = `Your order #${order.orderId} is being prepared and packed by the store.`;
        } else if (status === "arriving") {
          pushTitle = "Order is on the way!";
          pushBody = `Our delivery partner ${order.deliveryPartner?.name || "Delivery Agent"} is arriving with order #${order.orderId}. Share OTP ${order.deliveryOtp} to verify.`;
        } else if (status === "delivered") {
          pushTitle = "Order Delivered!";
          pushBody = `Your order #${order.orderId} has been delivered successfully. Thank you!`;
        }
        if (pushTitle) {
          sendPushNotification(order.customer, pushTitle, pushBody);
        }

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
  
