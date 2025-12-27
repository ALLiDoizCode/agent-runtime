/**
 * BTP Message Parser
 * Encoding/decoding functions for BTP protocol messages per RFC-0023 Section 4
 */

import {
  BTPMessage,
  BTPMessageType,
  BTPData,
  BTPErrorData,
  BTPProtocolData,
  BTPError,
  isBTPErrorData,
} from './btp-types';

/**
 * Parse BTP message from buffer (decode)
 * @param buffer - Raw BTP message buffer
 * @returns Parsed BTPMessage
 * @throws BTPError if message is malformed
 */
export function parseBTPMessage(buffer: Buffer): BTPMessage {
  if (buffer.length < 5) {
    throw new BTPError('F00', 'BTP message too short (minimum 5 bytes required)');
  }

  let offset = 0;

  // Read message type (1 byte)
  const type = buffer.readUInt8(offset);
  offset += 1;

  // Validate message type
  if (!Object.values(BTPMessageType).includes(type)) {
    throw new BTPError('F00', `Invalid BTP message type: ${type}`);
  }

  // Read request ID (4 bytes, big-endian uint32)
  const requestId = buffer.readUInt32BE(offset);
  offset += 4;

  // Parse message data based on type
  let data: BTPData | BTPErrorData;

  if (type === BTPMessageType.ERROR) {
    data = parseErrorData(buffer, offset);
  } else {
    data = parseMessageData(buffer, offset);
  }

  return {
    type: type as BTPMessageType,
    requestId,
    data,
  };
}

/**
 * Parse BTP error data
 */
function parseErrorData(buffer: Buffer, offset: number): BTPErrorData {
  // Read error code length (1 byte varuint)
  if (offset >= buffer.length) {
    throw new BTPError('F00', 'Truncated BTP ERROR message: missing code length');
  }
  const codeLength = buffer.readUInt8(offset);
  offset += 1;

  // Read error code
  if (offset + codeLength > buffer.length) {
    throw new BTPError('F00', 'Truncated BTP ERROR message: missing code');
  }
  const code = buffer.subarray(offset, offset + codeLength).toString('utf8');
  offset += codeLength;

  // Read error name length (1 byte varuint)
  if (offset >= buffer.length) {
    throw new BTPError('F00', 'Truncated BTP ERROR message: missing name length');
  }
  const nameLength = buffer.readUInt8(offset);
  offset += 1;

  // Read error name
  if (offset + nameLength > buffer.length) {
    throw new BTPError('F00', 'Truncated BTP ERROR message: missing name');
  }
  const name = buffer.subarray(offset, offset + nameLength).toString('utf8');
  offset += nameLength;

  // Read triggeredAt length (1 byte varuint)
  if (offset >= buffer.length) {
    throw new BTPError('F00', 'Truncated BTP ERROR message: missing triggeredAt length');
  }
  const triggeredAtLength = buffer.readUInt8(offset);
  offset += 1;

  // Read triggeredAt
  if (offset + triggeredAtLength > buffer.length) {
    throw new BTPError('F00', 'Truncated BTP ERROR message: missing triggeredAt');
  }
  const triggeredAt = buffer.subarray(offset, offset + triggeredAtLength).toString('utf8');
  offset += triggeredAtLength;

  // Read error data length (4 bytes, big-endian uint32)
  if (offset + 4 > buffer.length) {
    throw new BTPError('F00', 'Truncated BTP ERROR message: missing data length');
  }
  const dataLength = buffer.readUInt32BE(offset);
  offset += 4;

  // Read error data
  if (offset + dataLength > buffer.length) {
    throw new BTPError('F00', 'Truncated BTP ERROR message: missing data');
  }
  const errorData = buffer.subarray(offset, offset + dataLength);

  return {
    code,
    name,
    triggeredAt,
    data: errorData,
  };
}

/**
 * Parse BTP message data (non-error messages)
 */
function parseMessageData(buffer: Buffer, offset: number): BTPData {
  // Read protocol data count (1 byte varuint)
  if (offset >= buffer.length) {
    throw new BTPError('F00', 'Truncated BTP message: missing protocol data count');
  }
  const protocolDataCount = buffer.readUInt8(offset);
  offset += 1;

  // Parse protocol data array
  const protocolData: BTPProtocolData[] = [];
  for (let i = 0; i < protocolDataCount; i++) {
    const { data, newOffset } = parseProtocolData(buffer, offset);
    protocolData.push(data);
    offset = newOffset;
  }

  // Read ILP packet length (4 bytes, big-endian uint32)
  if (offset + 4 > buffer.length) {
    throw new BTPError('F00', 'Truncated BTP message: missing ILP packet length');
  }
  const ilpPacketLength = buffer.readUInt32BE(offset);
  offset += 4;

  // Read ILP packet (optional - length can be 0)
  let ilpPacket: Buffer | undefined;
  if (ilpPacketLength > 0) {
    if (offset + ilpPacketLength > buffer.length) {
      throw new BTPError('F00', 'Truncated BTP message: missing ILP packet');
    }
    ilpPacket = buffer.subarray(offset, offset + ilpPacketLength);
  }

  return {
    protocolData,
    ilpPacket,
  };
}

/**
 * Parse single protocol data entry
 */
function parseProtocolData(
  buffer: Buffer,
  offset: number
): { data: BTPProtocolData; newOffset: number } {
  // Read protocol name length (1 byte varuint)
  if (offset >= buffer.length) {
    throw new BTPError('F00', 'Truncated protocol data: missing protocol name length');
  }
  const protocolNameLength = buffer.readUInt8(offset);
  offset += 1;

  // Read protocol name
  if (offset + protocolNameLength > buffer.length) {
    throw new BTPError('F00', 'Truncated protocol data: missing protocol name');
  }
  const protocolName = buffer.subarray(offset, offset + protocolNameLength).toString('utf8');
  offset += protocolNameLength;

  // Read content type (2 bytes, big-endian uint16)
  if (offset + 2 > buffer.length) {
    throw new BTPError('F00', 'Truncated protocol data: missing content type');
  }
  const contentType = buffer.readUInt16BE(offset);
  offset += 2;

  // Read data length (4 bytes, big-endian uint32)
  if (offset + 4 > buffer.length) {
    throw new BTPError('F00', 'Truncated protocol data: missing data length');
  }
  const dataLength = buffer.readUInt32BE(offset);
  offset += 4;

  // Read data
  if (offset + dataLength > buffer.length) {
    throw new BTPError('F00', 'Truncated protocol data: missing data');
  }
  const data = buffer.subarray(offset, offset + dataLength);
  offset += dataLength;

  return {
    data: {
      protocolName,
      contentType,
      data,
    },
    newOffset: offset,
  };
}

/**
 * Serialize BTP message to buffer (encode)
 * @param message - BTPMessage to encode
 * @returns Encoded buffer
 */
export function serializeBTPMessage(message: BTPMessage): Buffer {
  const buffers: Buffer[] = [];

  // Write message type (1 byte)
  const typeBuffer = Buffer.allocUnsafe(1);
  typeBuffer.writeUInt8(message.type, 0);
  buffers.push(typeBuffer);

  // Write request ID (4 bytes, big-endian uint32)
  const requestIdBuffer = Buffer.allocUnsafe(4);
  requestIdBuffer.writeUInt32BE(message.requestId, 0);
  buffers.push(requestIdBuffer);

  // Serialize data based on type
  if (isBTPErrorData(message)) {
    buffers.push(serializeErrorData(message.data));
  } else {
    buffers.push(serializeMessageData(message.data as BTPData));
  }

  return Buffer.concat(buffers);
}

/**
 * Serialize BTP error data
 */
function serializeErrorData(errorData: BTPErrorData): Buffer {
  const buffers: Buffer[] = [];

  // Write error code
  const codeBuffer = Buffer.from(errorData.code, 'utf8');
  const codeLengthBuffer = Buffer.allocUnsafe(1);
  codeLengthBuffer.writeUInt8(codeBuffer.length, 0);
  buffers.push(codeLengthBuffer, codeBuffer);

  // Write error name
  const nameBuffer = Buffer.from(errorData.name, 'utf8');
  const nameLengthBuffer = Buffer.allocUnsafe(1);
  nameLengthBuffer.writeUInt8(nameBuffer.length, 0);
  buffers.push(nameLengthBuffer, nameBuffer);

  // Write triggeredAt
  const triggeredAtBuffer = Buffer.from(errorData.triggeredAt, 'utf8');
  const triggeredAtLengthBuffer = Buffer.allocUnsafe(1);
  triggeredAtLengthBuffer.writeUInt8(triggeredAtBuffer.length, 0);
  buffers.push(triggeredAtLengthBuffer, triggeredAtBuffer);

  // Write error data
  const dataLengthBuffer = Buffer.allocUnsafe(4);
  dataLengthBuffer.writeUInt32BE(errorData.data.length, 0);
  buffers.push(dataLengthBuffer, errorData.data);

  return Buffer.concat(buffers);
}

/**
 * Serialize BTP message data (non-error messages)
 */
function serializeMessageData(data: BTPData): Buffer {
  const buffers: Buffer[] = [];

  // Write protocol data count (1 byte varuint)
  const countBuffer = Buffer.allocUnsafe(1);
  countBuffer.writeUInt8(data.protocolData.length, 0);
  buffers.push(countBuffer);

  // Write protocol data array
  for (const pd of data.protocolData) {
    buffers.push(serializeProtocolData(pd));
  }

  // Write ILP packet length and data
  const ilpPacket = data.ilpPacket ?? Buffer.alloc(0);
  const ilpLengthBuffer = Buffer.allocUnsafe(4);
  ilpLengthBuffer.writeUInt32BE(ilpPacket.length, 0);
  buffers.push(ilpLengthBuffer);

  if (ilpPacket.length > 0) {
    buffers.push(ilpPacket);
  }

  return Buffer.concat(buffers);
}

/**
 * Serialize single protocol data entry
 */
function serializeProtocolData(pd: BTPProtocolData): Buffer {
  const buffers: Buffer[] = [];

  // Write protocol name
  const nameBuffer = Buffer.from(pd.protocolName, 'utf8');
  const nameLengthBuffer = Buffer.allocUnsafe(1);
  nameLengthBuffer.writeUInt8(nameBuffer.length, 0);
  buffers.push(nameLengthBuffer, nameBuffer);

  // Write content type (2 bytes, big-endian uint16)
  const contentTypeBuffer = Buffer.allocUnsafe(2);
  contentTypeBuffer.writeUInt16BE(pd.contentType, 0);
  buffers.push(contentTypeBuffer);

  // Write data length (4 bytes, big-endian uint32)
  const dataLengthBuffer = Buffer.allocUnsafe(4);
  dataLengthBuffer.writeUInt32BE(pd.data.length, 0);
  buffers.push(dataLengthBuffer);

  // Write data
  if (pd.data.length > 0) {
    buffers.push(pd.data);
  }

  return Buffer.concat(buffers);
}
