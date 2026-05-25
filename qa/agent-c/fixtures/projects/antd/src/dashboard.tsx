import Table from "antd/Table"
import Tag from "antd/Tag"
import Statistic from "antd/Statistic"
import Row from "antd/Row"
import Col from "antd/Col"
import Card from "antd/Card"

const columns = [
  { title: "Name", dataIndex: "name", key: "name" },
  { title: "Status", dataIndex: "status", key: "status",
    render: (status: string) => <Tag color="green">{status}</Tag> },
];

export function AntdDashboard() {
  return (
    <div>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="Revenue" value={12345} prefix="$" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Users" value={1123} />
          </Card>
        </Col>
      </Row>
      <Table dataSource={[]} columns={columns} />
    </div>
  )
}
