export async function neo4jRun(env: {
  NEO4J_QUERY_API_URL: string;
  NEO4J_USER: string;
  NEO4J_PASSWORD: string;
}, cypher: string, params: Record<string, any>) {
  const auth = btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`);

  // Neo4j Aura Query API v2 format
  const res = await fetch(env.NEO4J_QUERY_API_URL, {
    method: "POST",
    headers: {
      "authorization": `Basic ${auth}`,
      "content-type": "application/json",
      "accept": "application/json"
    },
    body: JSON.stringify({
      statement: cypher,
      parameters: params
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Neo4j query failed: ${res.status} - ${errorText}`);
  }
  return res.json();
}

export async function neo4jUpsertContactAndLinkCluster(env: any, args: {
  userId: string;
  clusterId: string;
  displayName: string;
  category: string;
}) {
  const contactId = `contact:${args.userId}:${args.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 64)}`;

  const cypher = `
    MERGE (u:User {convexUserId: $userId})

    MERGE (c:Contact {convexUserId: $userId, contactId: $contactId})
    ON CREATE SET c.createdAt = timestamp()
    SET c.displayName = $displayName,
        c.category = $category,
        c.updatedAt = timestamp()

    MERGE (sc:SpeakerCluster {convexUserId: $userId, clusterId: $clusterId})
    ON CREATE SET sc.createdAt = timestamp()
    SET sc.isLabeled = true,
        sc.updatedAt = timestamp()

    MERGE (u)-[:HAS_CONTACT]->(c)
    MERGE (u)-[:HAS_SPEAKER_CLUSTER]->(sc)
    MERGE (sc)-[:RESOLVES_TO]->(c)

    RETURN c.contactId AS contactId
  `;

  await neo4jRun(env, cypher, {
    userId: args.userId,
    clusterId: args.clusterId,
    displayName: args.displayName,
    category: args.category,
    contactId
  });

  return contactId;
}
