import { Chip } from '@mui/material';
import type { ShardedTopology as ShardedTopologyData } from 'api/explorer.types';
import { Messages } from '../cluster-overview.messages';
import { MemberTable } from '../member-table/member-table';
import { RouterTable } from '../router-table/router-table';
import { TopologySection } from '../topology-section/topology-section';

interface ShardedTopologyProps {
  topology: ShardedTopologyData;
}

export const ShardedTopology = ({ topology: { shards, configServers, routers } }: ShardedTopologyProps) => (
  <>
    {shards.length === 0 && (
      <TopologySection title={Messages.shardsTitle} emptyText={Messages.noShards} isEmpty />
    )}
    {shards.map((shard) => (
      <TopologySection
        key={shard.id}
        title={Messages.shardTitle(shard.id)}
        badge={shard.draining && <Chip size="small" color="warning" variant="outlined" label={Messages.draining} />}
        emptyText={Messages.noMembers}
        isEmpty={shard.members.length === 0}
      >
        <MemberTable members={shard.members} />
      </TopologySection>
    ))}
    {configServers && (
      <TopologySection
        title={Messages.configServersTitle(configServers.set)}
        emptyText={Messages.noMembers}
        isEmpty={configServers.members.length === 0}
      >
        <MemberTable members={configServers.members} />
      </TopologySection>
    )}
    <TopologySection title={Messages.routersTitle} emptyText={Messages.noRouters} isEmpty={routers.length === 0}>
      <RouterTable routers={routers} />
    </TopologySection>
  </>
);
