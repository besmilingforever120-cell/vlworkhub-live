const allowedDevOrigins = (
	process.env.NEXT_ALLOWED_DEV_ORIGINS
	|| ""
)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

export default {
	experimental: { typedRoutes: true },
	allowedDevOrigins
};
