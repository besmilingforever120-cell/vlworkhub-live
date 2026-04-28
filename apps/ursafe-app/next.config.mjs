const allowedDevOrigins = (
	process.env.NEXT_ALLOWED_DEV_ORIGINS
	|| ""
)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

export default {
	reactStrictMode: false,
	typedRoutes: true,
	allowedDevOrigins,
	env: {
		MAIN_PLATFORM_URL: process.env.MAIN_PLATFORM_URL,
		HR_APP_URL: process.env.HR_APP_URL,
		CARE_APP_URL: process.env.CARE_APP_URL,
		URSAFE_APP_URL: process.env.URSAFE_APP_URL,
		API_BASE_URL: process.env.API_BASE_URL,
		NEXT_PUBLIC_MAIN_APP_URL: process.env.MAIN_PLATFORM_URL,
		NEXT_PUBLIC_ROOT_URL: process.env.MAIN_PLATFORM_URL,
		NEXT_PUBLIC_HR_APP_URL: process.env.HR_APP_URL,
		NEXT_PUBLIC_CARE_APP_URL: process.env.CARE_APP_URL,
		NEXT_PUBLIC_URSAFE_APP_URL: process.env.URSAFE_APP_URL,
		NEXT_PUBLIC_API_URL: process.env.API_BASE_URL
	}
};
