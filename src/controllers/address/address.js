import mongoose from "mongoose";
import CustomerAddress from "../../models/customerAddress.js";
import { Customer } from "../../models/user.js";

const labels = new Set(["home", "office", "other"]);

const normalizePhone = value => String(value || "").replace(/\D/g, "");
const clean = (value, max = 160) => String(value || "").trim().slice(0, max);
const isValidCoordinate = location => {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
};

const toAddressDto = address => ({
  id: String(address._id),
  receiverName: address.receiverName,
  phone: address.phone,
  label: address.label,
  house: address.house,
  area: address.area,
  landmark: address.landmark || "",
  formattedAddress: address.formattedAddress || "",
  location: address.location,
  isSelected: Boolean(address.isSelected),
});

const buildPayload = body => {
  const phone = normalizePhone(body?.phone);
  const location = {
    latitude: Number(body?.location?.latitude),
    longitude: Number(body?.location?.longitude),
  };

  return {
    receiverName: clean(body?.receiverName, 80),
    phone,
    label: labels.has(body?.label) ? body.label : "home",
    house: clean(body?.house),
    area: clean(body?.area),
    landmark: clean(body?.landmark),
    formattedAddress: clean(body?.formattedAddress, 500),
    location,
    isSelected: body?.isSelected !== false,
  };
};

const validatePayload = payload => {
  if (!payload.receiverName) return "Receiver name is required";
  if (!/^[6-9]\d{9}$/.test(payload.phone)) return "Valid Indian mobile number required";
  if (!payload.house) return "House, flat or floor is required";
  if (!payload.area) return "Area or locality is required";
  if (!isValidCoordinate(payload.location)) return "Valid map location is required";
  return null;
};

export const listAddresses = async (req, reply) => {
  if (req.user.role !== "Customer") return reply.code(403).send({ message: "Only customers can manage addresses" });
  const addresses = await CustomerAddress.find({ customer: req.user.userId }).sort({ isSelected: -1, updatedAt: -1 }).lean();
  return reply.send({ addresses: addresses.map(toAddressDto) });
};

export const createAddress = async (req, reply) => {
  if (req.user.role !== "Customer") return reply.code(403).send({ message: "Only customers can manage addresses" });

  const count = await CustomerAddress.countDocuments({ customer: req.user.userId });
  if (count >= 10) return reply.code(400).send({ message: "You can save up to 10 addresses" });

  const payload = buildPayload(req.body);
  const validationError = validatePayload(payload);
  if (validationError) return reply.code(400).send({ message: validationError });

  const address = await CustomerAddress.create({
    ...payload,
    customer: req.user.userId,
    isSelected: payload.isSelected || count === 0,
  });

  if (address.isSelected) {
    await Customer.findByIdAndUpdate(req.user.userId, {
      $set: {
        selectedAddress: address._id,
        liveLocation: address.location,
        address: [address.house, address.area, address.formattedAddress].filter(Boolean).join(", "),
      },
    });
  }

  return reply.code(201).send({ address: toAddressDto(address) });
};

export const updateAddress = async (req, reply) => {
  if (req.user.role !== "Customer") return reply.code(403).send({ message: "Only customers can manage addresses" });
  if (!mongoose.isValidObjectId(req.params.addressId)) return reply.code(400).send({ message: "Invalid address id" });

  const payload = buildPayload(req.body);
  const validationError = validatePayload(payload);
  if (validationError) return reply.code(400).send({ message: validationError });

  const address = await CustomerAddress.findOneAndUpdate(
    { _id: req.params.addressId, customer: req.user.userId },
    { $set: payload },
    { new: true, runValidators: true },
  );

  if (!address) return reply.code(404).send({ message: "Address not found" });

  if (address.isSelected) {
    await Customer.findByIdAndUpdate(req.user.userId, {
      $set: {
        selectedAddress: address._id,
        liveLocation: address.location,
        address: [address.house, address.area, address.formattedAddress].filter(Boolean).join(", "),
      },
    });
  }

  return reply.send({ address: toAddressDto(address) });
};

export const selectAddress = async (req, reply) => {
  if (req.user.role !== "Customer") return reply.code(403).send({ message: "Only customers can manage addresses" });
  if (!mongoose.isValidObjectId(req.params.addressId)) return reply.code(400).send({ message: "Invalid address id" });

  const address = await CustomerAddress.findOneAndUpdate(
    { _id: req.params.addressId, customer: req.user.userId },
    { $set: { isSelected: true } },
    { new: true, runValidators: true },
  );

  if (!address) return reply.code(404).send({ message: "Address not found" });

  await Customer.findByIdAndUpdate(req.user.userId, {
    $set: {
      selectedAddress: address._id,
      liveLocation: address.location,
      address: [address.house, address.area, address.formattedAddress].filter(Boolean).join(", "),
    },
  });

  return reply.send({ address: toAddressDto(address) });
};

export const deleteAddress = async (req, reply) => {
  if (req.user.role !== "Customer") return reply.code(403).send({ message: "Only customers can manage addresses" });
  if (!mongoose.isValidObjectId(req.params.addressId)) return reply.code(400).send({ message: "Invalid address id" });

  const address = await CustomerAddress.findOneAndDelete({ _id: req.params.addressId, customer: req.user.userId });
  if (!address) return reply.code(404).send({ message: "Address not found" });

  if (address.isSelected) {
    const nextAddress = await CustomerAddress.findOne({ customer: req.user.userId }).sort({ updatedAt: -1 });
    if (nextAddress) {
      nextAddress.isSelected = true;
      await nextAddress.save();
      await Customer.findByIdAndUpdate(req.user.userId, {
        $set: {
          selectedAddress: nextAddress._id,
          liveLocation: nextAddress.location,
          address: [nextAddress.house, nextAddress.area, nextAddress.formattedAddress].filter(Boolean).join(", "),
        },
      });
    } else {
      await Customer.findByIdAndUpdate(req.user.userId, { $unset: { selectedAddress: "" } });
    }
  }

  return reply.code(204).send();
};
