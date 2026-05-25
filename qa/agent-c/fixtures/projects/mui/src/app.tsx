import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import Card from "@mui/material/Card"
import CardContent from "@mui/material/CardContent"
import Typography from "@mui/material/Typography"

export function MuiForm() {
  return (
    <Card>
      <CardContent>
        <Typography variant="h5" component="h2">Sign In</Typography>
        <TextField label="Email" type="email" fullWidth margin="normal" />
        <TextField label="Password" type="password" fullWidth margin="normal" />
        <Button variant="contained" color="primary" fullWidth>
          Sign In
        </Button>
      </CardContent>
    </Card>
  )
}
