"use strict";

const multicastDns = require("multicast-dns");

/**
 * Starts an mDNS responder that answers A/AAAA queries for the provided hostname.
 * Returns a cleanup function that tears the responder down.
 * @param {Object} options
 * @param {string} options.hostname - Fully-qualified hostname to advertise.
 * @param {string} [options.ipv4Address="127.0.0.1"] - IPv4 address to announce.
 * @param {string} [options.ipv6Address="::1"] - IPv6 address to announce.
 * @param {number} [options.ttl=60] - TTL in seconds for responses.
 * @returns {() => void}
 */
function startMdnsAdvertiser({
  hostname,
  ipv4Address = "127.0.0.1",
  ipv6Address = "::1",
  ttl = 60
} = {}) {
  if (!hostname) {
    throw new Error("hostname is required for mDNS advertisement");
  }

  const responder = multicastDns();

  responder.on("query", (query) => {
    const answers = [];

    for (const question of query.questions) {
      const { name, type } = question;
      if (!name || name.toLowerCase() !== hostname.toLowerCase()) {
        continue;
      }

      if (type === "A" || type === "ANY") {
        answers.push({
          name: hostname,
          type: "A",
          ttl,
          data: ipv4Address
        });
      }

      if ((type === "AAAA" || type === "ANY") && ipv6Address) {
        answers.push({
          name: hostname,
          type: "AAAA",
          ttl,
          data: ipv6Address
        });
      }
    }

    if (answers.length > 0) {
      responder.respond({ answers });
    }
  });

  return () => responder.destroy();
}

module.exports = {
  startMdnsAdvertiser
};
