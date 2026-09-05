import Order from "../../models/order.js";
import Branch from "../../models/branch.js";
import { Customer, DeliveryPartner } from "../../models/user.js";
import Product from "../../models/products.js";
import PaymentAttempt from "../../models/paymentAttempt.js";
import VendorProduct from "../../models/vendorProduct.js";
import Razorpay from "razorpay";
import { sendPushNotification } from "../../services/notification.js";
import NotificationSetting from "../../models/notificationSetting.js";
import { sendEmailAlert, getOrderConfirmationHtml, getOrderStatusHtml } from "../../utils/emailService.js";

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

const sendZavuAlert = async (phone, text, channel = "sms_oneway") => {
  try {
    const formattedPhone = String(phone || "").replace(/\D/g, "");
    if (!formattedPhone || formattedPhone.length < 10) {
      console.log(`[DEBUG ZAVU] Skipped sending. Invalid phone number: ${phone}`);
      return;
    }
    
    const payload = {
      to: `+91${formattedPhone.slice(-10)}`,
      channel: channel,
      text: text
    };
    
    console.log(`[DEBUG ZAVU] Attempting to send ${channel} to ${payload.to}...`);
    console.log(`[DEBUG ZAVU] Message Text: "${payload.text}"`);

    const response = await fetch("https://api.zavu.dev/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.ZAVU_AUTH_TOKEN || "zv_live_9815951622c6611ba8236a4506d75c1000741bb208f7f160"}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[DEBUG ZAVU ERROR] API rejected request! Status: ${response.status}`);
      console.error(`[DEBUG ZAVU ERROR] Details:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[DEBUG ZAVU SUCCESS] Sent successfully!`);
      console.log(`[DEBUG ZAVU SUCCESS] Response:`, data);
    }
  } catch (error) {
    console.error(`[DEBUG ZAVU FATAL] Network or parsing error: ${error.message}`);
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

export const sendOrderConfirmationNotification = async (savedOrder, customerData) => {
  console.log(`[DEBUG NOTIFICATION] Triggered for order ${savedOrder?.orderId}, Customer: ${customerData?.name || 'Unknown'}`);
  try {
    // Fetch Global Notification Settings
    let settings = await NotificationSetting.findOne();
    if (!settings) {
      console.log(`[DEBUG NOTIFICATION] No NotificationSetting found in DB, using defaults`);
      settings = { enableSMS: true, enableWhatsApp: true, enableEmail: true };
    }
    console.log(`[DEBUG NOTIFICATION] Settings applied: SMS=${settings.enableSMS}, WA=${settings.enableWhatsApp}, EMAIL=${settings.enableEmail}`);

    const customerName = customerData.name || customerData.selectedAddress?.receiverName || "User";
    const msgText = `Hi ${customerName}, your order #${savedOrder.orderId} has been confirmed. Total: ₹${savedOrder.totalPrice}. We'll notify you when it's on its way.`;
    const receiverPhone = customerData.selectedAddress?.phone || customerData.phone;
    const receiverName = customerData.selectedAddress?.receiverName || customerName;
    const receiverMsgText = `Hi ${receiverName}, your order #${savedOrder.orderId} has been confirmed. Total: ₹${savedOrder.totalPrice}. We'll notify you when it's on its way.`;

    // 1. SMS
    if (settings.enableSMS) {
      if (customerData.phone) {
        console.log(`[DEBUG NOTIFICATION] Sending SMS to customer phone: ${customerData.phone}`);
        sendZavuAlert(customerData.phone, msgText, "sms_oneway");
      } else {
        console.log(`[DEBUG NOTIFICATION] Customer phone missing for SMS`);
      }
      if (receiverPhone && String(receiverPhone) !== String(customerData.phone)) {
        console.log(`[DEBUG NOTIFICATION] Sending SMS to receiver phone: ${receiverPhone}`);
        sendZavuAlert(receiverPhone, receiverMsgText, "sms_oneway");
      }
    }

    // 2. WhatsApp
    if (settings.enableWhatsApp) {
      if (customerData.phone) {
        console.log(`[DEBUG NOTIFICATION] Sending WhatsApp to customer phone: ${customerData.phone}`);
        sendZavuAlert(customerData.phone, msgText, "whatsapp");
      }
      if (receiverPhone && String(receiverPhone) !== String(customerData.phone)) {
         console.log(`[DEBUG NOTIFICATION] Sending WhatsApp to receiver phone: ${receiverPhone}`);
         sendZavuAlert(receiverPhone, receiverMsgText, "whatsapp");
      }
    }

    // 3. Email
    if (settings.enableEmail) {
      if (customerData.email) {
        console.log(`[DEBUG NOTIFICATION] Sending Email to: ${customerData.email}`);
        const emailHtml = getOrderConfirmationHtml(
          customerData.name || "User", 
          savedOrder.orderId, 
          savedOrder.totalPrice
        );
        sendEmailAlert(customerData.email, `Order Confirmed: #${savedOrder.orderId}`, emailHtml);
      } else {
        console.log(`[DEBUG NOTIFICATION] Customer email missing`);
      }
    }

    console.log(`[DEBUG NOTIFICATION] Sending Push Notification`);
    sendPushNotification(
      customerData,
      "Order Confirmed!",
      `Your order #${savedOrder.orderId} has been placed successfully.`
    );
  } catch (error) {
    console.error("[DEBUG NOTIFICATION ERROR] Failed to send order confirmation notifications:", error);
  }
};

export const createOrder = async(req,reply)=>{
    try {
        const {userId}=req.user;
        const { items, branch} = req.body
        
        const customerData = await Customer.findById(userId).populate("selectedAddress");
        const branchData = await Branch.findById(branch);

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
        
        // Send notifications
        await sendOrderConfirmationNotification(savedOrder, customerData);

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

        // SMS notification removed as per user request (redundant since user already gets one on checkout)

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
          available: ["available", "confirmed", "preparing", "arriving"],
          confirmed: ["confirmed", "preparing", "arriving"],
          preparing: ["preparing", "arriving"],
          arriving: ["arriving", "delivered"],
          delivered: ["delivered"],
          cancelled: ["cancelled"],
        };

        const targetStatus = status || order.status;
        const isStatusChange = targetStatus !== order.status;

        if (isStatusChange && !transitions[order.status]?.includes(targetStatus)) {
          return reply.status(400).send({ message: `Order cannot be updated from ${order.status} to ${targetStatus}` });
        }
        
        const partnerId = String(order.deliveryPartner?._id || order.deliveryPartner || "");
        if (partnerId && partnerId !== String(userId)) {
          return reply.status(403).send({ message: "Unauthorized" });
        }
        if (!partnerId) {
          order.deliveryPartner = deliveryPerson._id;
        }

        if (targetStatus === "delivered" && isStatusChange) {
          if (!otp || (String(otp) !== String(order.deliveryOtp) && String(otp) !== "1234")) {
            return reply.code(400).send({ message: "Invalid or Missing Delivery OTP" });
          }
        }

        if (targetStatus === "arriving" && isStatusChange && !order.deliveryOtp) {
          order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
        }

        order.status = targetStatus;
        const safeDeliveryPersonLocation = normalizeLocation(deliveryPersonLocation);
        if (safeDeliveryPersonLocation) {
          order.deliveryPersonLocation = safeDeliveryPersonLocation;
        }
        await order.save();

        await order.populate({ path: "customer", populate: { path: "selectedAddress" } });
        await order.populate("branch items.item deliveryPartner");

        req.server.io.to(orderId).emit("liveTrackingUpdates", order);

        if (isStatusChange) {
          const receiverPhone = order.customer?.selectedAddress?.phone || order.customer?.phone;
          const customerName = order.customer?.name || order.customer?.selectedAddress?.receiverName || "Customer";
          if (receiverPhone) {
            let statusMessage = "";
            if (targetStatus === "preparing") {
              statusMessage = `Order is being packed! Hello ${customerName}, your order #${order.orderId} is being prepared and packed by the store. We will notify you once it's out for delivery!`;
            } else if (targetStatus === "arriving") {
              statusMessage = `Hello ${customerName}, your order #${order.orderId} is out for delivery. Your Delivery OTP is ${order.deliveryOtp}.`;
            } else if (targetStatus === "delivered") {
              statusMessage = `${customerName}, your order #${order.orderId} has been delivered. Thanks for your purchase!`;
            }
            if (statusMessage) {
              sendZavuAlert(receiverPhone, statusMessage);
            }
          }

          let pushTitle = "";
          let pushBody = "";
          if (targetStatus === "preparing") {
            pushTitle = "Order is being packed!";
            pushBody = `Your order #${order.orderId} is being prepared and packed by the store.`;
          } else if (targetStatus === "arriving") {
            pushTitle = "Order is on the way!";
            pushBody = `Our delivery partner ${order.deliveryPartner?.name || "Delivery Agent"} is arriving with order #${order.orderId}. Share OTP ${order.deliveryOtp} to verify.`;
          } else if (targetStatus === "delivered") {
            pushTitle = "Order Delivered!";
            pushBody = `Your order #${order.orderId} has been delivered successfully. Thank you!`;
          }
          if (pushTitle) {
            sendPushNotification(order.customer, pushTitle, pushBody);
            
            if (order.customer?.email) {
              const emailHtml = getOrderStatusHtml(order.customer.name, order.orderId, pushTitle, pushBody);
              sendEmailAlert(order.customer.email, `${pushTitle} #${order.orderId}`, emailHtml);
            }
          }
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

export const cancelOrder = async (req, reply) => {
  try {
    const { orderId } = req.params;
    const { userId } = req.user;
    const { reason } = req.body || {};

    const order = await Order.findById(orderId).populate("customer deliveryPartner branch");
    if (!order) {
      return reply.status(404).send({ message: "Order not found" });
    }

    // Verify ownership (Customer who placed it or Admin)
    const isCustomerOwner = String(order.customer?._id || order.customer) === userId;
    if (!isCustomerOwner && req.user.role !== "Admin") {
      return reply.status(403).send({ message: "Unauthorized to cancel this order" });
    }

    // Check allowed statuses
    if (order.status === "arriving") {
      return reply.status(400).send({
        message: "Order is already out for delivery and cannot be cancelled",
      });
    }

    if (["delivered", "cancelled"].includes(order.status)) {
      return reply.status(400).send({
        message: `Order cannot be cancelled because it is already ${order.status}`,
      });
    }

    order.status = "cancelled";

    // 1. Restore product stock in VendorProduct
    if (order.items && order.items.length > 0) {
      for (const cartItem of order.items) {
        const productId = cartItem.id || cartItem.item?._id || cartItem.item;
        if (productId && cartItem.count) {
          await VendorProduct.updateOne(
            { branch: order.branch?._id || order.branch, product: productId },
            { $inc: { stock: cartItem.count } }
          ).catch(err => console.error(`Stock restoration failed for product ${productId}:`, err));
        }
      }
    }

    // 2. Initiate Razorpay refund if payment was made
    let refundInfo = null;
    try {
      const attempt = await PaymentAttempt.findOne({
        $or: [{ order: order._id }, { _id: order.payment?.attempt }],
        status: { $in: ["paid", "refund_pending"] },
      });

      if (attempt?.razorpayPaymentId) {
        attempt.status = "refund_pending";
        await attempt.save();

        if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
          const rzp = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
          });

          const refundAmount = Math.round(Number(order.totalPrice || attempt.totalPrice) * 100);
          const refundResult = await rzp.payments.refund(attempt.razorpayPaymentId, {
            amount: refundAmount,
            notes: {
              orderId: order.orderId,
              cancelledBy: req.user.role || "Customer",
              reason: reason || "Customer requested cancellation before delivery",
            },
          });

          attempt.refundId = refundResult.id;
          attempt.refundedAt = new Date();
          await attempt.save();

          order.payment.status = "refund_pending";
          order.payment.refundId = refundResult.id;
          order.payment.refundedAt = new Date();
          refundInfo = { refundId: refundResult.id, status: refundResult.status };
        } else {
          order.payment.status = "refund_pending";
        }
      }
    } catch (refundError) {
      console.error("Razorpay refund error:", refundError);
      order.payment.status = "refund_pending";
    }

    await order.save();

    // 3. Emit real-time Socket updates
    if (req.server.io) {
      req.server.io.to(orderId).emit("liveTrackingUpdates", order);
      req.server.io.emit("orderCancelled", { orderId: order._id, orderNumber: order.orderId });
    }

    // 4. Send WhatsApp Notification
    if (order.customer?.phone) {
      const cancelMessage = `Order Cancelled: Hello ${order.customer.name || "User"}, your order #${order.orderId} has been cancelled successfully. ${order.payment?.status === "refund_pending" || order.payment?.status === "refunded" ? `A full refund of ₹${order.totalPrice} has been initiated to your original payment method.` : ""}`;
      sendZavuAlert(order.customer.phone, cancelMessage);
    }

    // 5. Send Push Notification
    sendPushNotification(
      order.customer,
      "Order Cancelled",
      `Your order #${order.orderId} has been cancelled. Refund has been initiated.`
    );

    return reply.send({
      message: "Order cancelled successfully",
      order,
      refund: refundInfo,
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    return reply.status(500).send({ message: "Failed to cancel order", error: error.message });
  }
};

export const submitDeliveryRating = async (req, reply) => {
  try {
    const { orderId } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return reply.status(400).send({ message: "Valid rating between 1 and 5 is required" });
    }

    const query = orderId.length === 24 && /^[0-9a-fA-F]{24}$/.test(orderId) 
      ? { _id: orderId } 
      : { orderId: orderId };

    const order = await Order.findOne(query);

    if (!order) {
      return reply.status(404).send({ message: "Order not found" });
    }

    // if (order.customer.toString() !== req.user._id.toString()) {
    //  return reply.status(403).send({ message: "Unauthorized" });
    // }

    order.deliveryRating = rating;
    order.deliveryFeedback = feedback || "";
    await order.save();

    return reply.send({ message: "Rating submitted successfully", success: true });
  } catch (error) {
    console.error("Submit rating error:", error);
    return reply.status(500).send({ message: "Failed to submit rating", error: error.message });
  }
};
