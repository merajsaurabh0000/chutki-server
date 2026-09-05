import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL || "haritlokvyanjan@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "pdjmrkhocnrrugxr",
  },
});

export const sendEmailAlert = async (to, subject, htmlContent) => {
  if (!to) return;
  try {
    const mailOptions = {
      from: `"Haritgram" <${process.env.EMAIL}>`,
      to,
      subject,
      html: htmlContent,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully: ", info.messageId);
  } catch (error) {
    console.error("Error sending email: ", error);
  }
};

export const getOrderConfirmationHtml = (customerName, orderId, totalPrice) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4CAF50; text-align: center;">Order Confirmed!</h2>
      <p style="font-size: 16px; color: #333;">Hi <strong>${customerName || "User"}</strong>,</p>
      <p style="font-size: 16px; color: #333;">Thank you for shopping with us! Your order <strong>#${orderId}</strong> has been confirmed successfully.</p>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 0; font-size: 16px; color: #555;"><strong>Order ID:</strong> #${orderId}</p>
        <p style="margin: 10px 0 0; font-size: 16px; color: #555;"><strong>Total Amount:</strong> ₹${totalPrice}</p>
      </div>
      
      <p style="font-size: 14px; color: #777;">We will notify you once your order is on its way!</p>
      
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #aaa; text-align: center;">
        Haritgram App &copy; ${new Date().getFullYear()}
      </p>
    </div>
  `;
};

export const getOrderStatusHtml = (customerName, orderId, statusTitle, statusMessage) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4CAF50; text-align: center;">${statusTitle}</h2>
      <p style="font-size: 16px; color: #333;">Hi <strong>${customerName || "User"}</strong>,</p>
      <p style="font-size: 16px; color: #333;">${statusMessage}</p>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 0; font-size: 16px; color: #555;"><strong>Order ID:</strong> #${orderId}</p>
      </div>
      
      <p style="font-size: 14px; color: #777;">Thank you for shopping with Haritgram!</p>
      
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #aaa; text-align: center;">
        Haritgram App &copy; ${new Date().getFullYear()}
      </p>
    </div>
  `;
};
