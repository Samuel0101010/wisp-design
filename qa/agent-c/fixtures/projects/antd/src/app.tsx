import Button from "antd/Button"
import Input from "antd/Input"
import Card from "antd/Card"
import Form from "antd/Form"

export function AntdForm() {
  return (
    <Card title="Sign In" style={{ maxWidth: 400 }}>
      <Form layout="vertical">
        <Form.Item label="Email">
          <Input type="email" placeholder="Enter your email" />
        </Form.Item>
        <Form.Item label="Password">
          <Input.Password placeholder="Enter your password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block>
          Sign In
        </Button>
      </Form>
    </Card>
  )
}
