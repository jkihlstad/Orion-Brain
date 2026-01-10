//
//  AnyCodable.swift
//  Neural Intelligence iOS Edge App
//
//  A generic Codable wrapper that enables encoding and decoding of heterogeneous
//  JSON payloads with type-erased values.
//
//  Copyright (c) 2024 Neural Intelligence. All rights reserved.
//

import Foundation

// MARK: - AnyCodable

/// A type-erased `Codable` value that can wrap any primitive, array, or dictionary.
///
/// `AnyCodable` enables flexible JSON payload handling when the structure is dynamic
/// or not known at compile time. It supports all JSON-compatible types including:
/// - Primitives: `String`, `Int`, `Double`, `Bool`, `nil`
/// - Collections: `Array`, `Dictionary`
/// - Nested structures of any depth
///
/// Example usage:
/// ```swift
/// let payload: [String: AnyCodable] = [
///     "name": AnyCodable("Neural Task"),
///     "priority": AnyCodable(1),
///     "metadata": AnyCodable(["key": "value"])
/// ]
/// ```
public struct AnyCodable: Codable, Equatable, Hashable {

    // MARK: - Properties

    /// The underlying type-erased value.
    public let value: Any

    // MARK: - Initialization

    /// Creates an `AnyCodable` instance wrapping the given value.
    ///
    /// - Parameter value: The value to wrap. Must be a JSON-compatible type.
    public init(_ value: Any) {
        self.value = value
    }

    /// Creates an `AnyCodable` instance from a decoder.
    ///
    /// - Parameter decoder: The decoder to read data from.
    /// - Throws: `DecodingError` if the value cannot be decoded.
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self.value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map { $0.value }
        } else if let dictionary = try? container.decode([String: AnyCodable].self) {
            self.value = dictionary.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "AnyCodable cannot decode value of unsupported type"
            )
        }
    }

    // MARK: - Codable

    /// Encodes this value into the given encoder.
    ///
    /// - Parameter encoder: The encoder to write data to.
    /// - Throws: `EncodingError` if the value cannot be encoded.
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let int8 as Int8:
            try container.encode(int8)
        case let int16 as Int16:
            try container.encode(int16)
        case let int32 as Int32:
            try container.encode(int32)
        case let int64 as Int64:
            try container.encode(int64)
        case let uint as UInt:
            try container.encode(uint)
        case let uint8 as UInt8:
            try container.encode(uint8)
        case let uint16 as UInt16:
            try container.encode(uint16)
        case let uint32 as UInt32:
            try container.encode(uint32)
        case let uint64 as UInt64:
            try container.encode(uint64)
        case let float as Float:
            try container.encode(float)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let date as Date:
            try container.encode(date)
        case let url as URL:
            try container.encode(url)
        case let data as Data:
            try container.encode(data)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dictionary as [String: Any]:
            try container.encode(dictionary.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "AnyCodable cannot encode value of type \(type(of: value))"
                )
            )
        }
    }

    // MARK: - Equatable

    /// Compares two `AnyCodable` values for equality.
    ///
    /// - Parameters:
    ///   - lhs: The left-hand side value.
    ///   - rhs: The right-hand side value.
    /// - Returns: `true` if the values are equal, `false` otherwise.
    public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        switch (lhs.value, rhs.value) {
        case is (NSNull, NSNull):
            return true
        case let (lhs as Bool, rhs as Bool):
            return lhs == rhs
        case let (lhs as Int, rhs as Int):
            return lhs == rhs
        case let (lhs as Double, rhs as Double):
            return lhs == rhs
        case let (lhs as String, rhs as String):
            return lhs == rhs
        case let (lhs as [Any], rhs as [Any]):
            return lhs.map(AnyCodable.init) == rhs.map(AnyCodable.init)
        case let (lhs as [String: Any], rhs as [String: Any]):
            return lhs.mapValues(AnyCodable.init) == rhs.mapValues(AnyCodable.init)
        default:
            return false
        }
    }

    // MARK: - Hashable

    /// Hashes the essential components of this value.
    ///
    /// - Parameter hasher: The hasher to use when combining components.
    public func hash(into hasher: inout Hasher) {
        switch value {
        case is NSNull:
            hasher.combine(0)
        case let bool as Bool:
            hasher.combine(bool)
        case let int as Int:
            hasher.combine(int)
        case let double as Double:
            hasher.combine(double)
        case let string as String:
            hasher.combine(string)
        case let array as [Any]:
            hasher.combine(array.map(AnyCodable.init))
        case let dictionary as [String: Any]:
            hasher.combine(dictionary.mapValues(AnyCodable.init))
        default:
            break
        }
    }
}

// MARK: - ExpressibleByLiteral Conformances

extension AnyCodable: ExpressibleByNilLiteral {
    public init(nilLiteral: ()) {
        self.init(NSNull())
    }
}

extension AnyCodable: ExpressibleByBooleanLiteral {
    public init(booleanLiteral value: Bool) {
        self.init(value)
    }
}

extension AnyCodable: ExpressibleByIntegerLiteral {
    public init(integerLiteral value: Int) {
        self.init(value)
    }
}

extension AnyCodable: ExpressibleByFloatLiteral {
    public init(floatLiteral value: Double) {
        self.init(value)
    }
}

extension AnyCodable: ExpressibleByStringLiteral {
    public init(stringLiteral value: String) {
        self.init(value)
    }
}

extension AnyCodable: ExpressibleByArrayLiteral {
    public init(arrayLiteral elements: Any...) {
        self.init(elements)
    }
}

extension AnyCodable: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, Any)...) {
        self.init(Dictionary(uniqueKeysWithValues: elements))
    }
}

// MARK: - Convenience Accessors

extension AnyCodable {

    /// Returns the value as a `Bool`, if possible.
    public var boolValue: Bool? {
        value as? Bool
    }

    /// Returns the value as an `Int`, if possible.
    public var intValue: Int? {
        value as? Int
    }

    /// Returns the value as a `Double`, if possible.
    public var doubleValue: Double? {
        value as? Double
    }

    /// Returns the value as a `String`, if possible.
    public var stringValue: String? {
        value as? String
    }

    /// Returns the value as an array, if possible.
    public var arrayValue: [Any]? {
        value as? [Any]
    }

    /// Returns the value as a dictionary, if possible.
    public var dictionaryValue: [String: Any]? {
        value as? [String: Any]
    }

    /// Returns `true` if the value is `nil` or `NSNull`.
    public var isNull: Bool {
        value is NSNull
    }
}

// MARK: - CustomStringConvertible

extension AnyCodable: CustomStringConvertible {
    public var description: String {
        switch value {
        case is NSNull:
            return "null"
        case let bool as Bool:
            return bool.description
        case let int as Int:
            return int.description
        case let double as Double:
            return double.description
        case let string as String:
            return "\"\(string)\""
        case let array as [Any]:
            return array.map { AnyCodable($0).description }.description
        case let dictionary as [String: Any]:
            return dictionary.mapValues { AnyCodable($0).description }.description
        default:
            return String(describing: value)
        }
    }
}

// MARK: - CustomDebugStringConvertible

extension AnyCodable: CustomDebugStringConvertible {
    public var debugDescription: String {
        "AnyCodable(\(description))"
    }
}
